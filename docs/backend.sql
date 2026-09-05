-- Tabella delle schedine chiuse in [S6.03].
-- Da incollare nell'SQL Editor di Supabase (Database -> SQL Editor -> New query).
--
-- Il timestamp lo mette il server, non il client: lo script master chiede
-- "run.submitted_at = TIMESTAMP SERVER" proprio per questo, un orologio del
-- telefono spostato non deve poter cambiare l'ordine di arrivo.

create table if not exists public.runs (
  id           uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  -- Identificativo della partita, generato dal gioco. Serve a tenere UNA riga
  -- per partita: la schedina parte due volte (conferma delle previsioni, e poi
  -- i moltiplicatori del quiz, che arrivano giorni dopo) e la seconda deve
  -- riscrivere la prima, non aggiungerne un'altra. Ci vuole l'indice unico
  -- qui sotto, altrimenti l'upsert non ha su cosa agganciarsi.
  run_id       uuid,
  nome         text,
  -- Aggiunta insieme al campo cognome nel terminale: facoltativo, puo' essere
  -- null. Serve solo a identificare il giocatore nei punteggi come "Nome C."
  -- (nome + iniziale del cognome) — non e' il nickname con cui il gioco si
  -- rivolge a lui, quello resta 'nome'. Se la tabella esiste gia':
  --     alter table public.runs add column if not exists cognome text;
  cognome      text,
  genere       text,
  store        text,
  reparto      text,
  anni         text,
  device       text,
  stile        text,
  punti        integer,
  picks        jsonb,
  flags        jsonb,
  -- Aggiunta con S8: livelli superati, moltiplicatori vinti e come sono stati
  -- distribuiti. Se la tabella e' stata creata prima di S8 la colonna va
  -- aggiunta, altrimenti l'invio viene rifiutato con un 400 (PGRST204: "could
  -- not find the 'quiz' column"). Si aggiunge senza toccare le schedine gia'
  -- arrivate:
  --     alter table public.runs add column if not exists quiz jsonb;
  quiz         jsonb,
  -- Aggiunta con l'Apple Campus Run: il record della corsa. Come per le altre,
  -- se la tabella esiste gia' va aggiunta prima di pubblicare, altrimenti
  -- l'invio viene rifiutato con un 400 (PGRST204):
  --     alter table public.runs add column if not exists runner jsonb;
  runner       jsonb,
  -- Aggiunta con la schermata dell'email (dopo il teleprompter, prima dei
  -- titoli di coda): e' facoltativa, quindi puo' essere null. Se la tabella
  -- esiste gia', la colonna va aggiunta prima di pubblicare, altrimenti
  -- l'invio viene rifiutato con un 400 (PGRST204):
  --     alter table public.runs add column if not exists email text;
  email        text,
  versione     text
);

-- Se la tabella e' stata creata prima di S8, dell'email, della corsa o dell'id
-- di partita, le colonne aggiunte dopo vanno messe a mano: senza, ogni schedina
-- viene rifiutata con un 400 e resta in coda nel telefono, in silenzio.
--     alter table public.runs add column if not exists quiz    jsonb;
--     alter table public.runs add column if not exists email   text;
--     alter table public.runs add column if not exists runner  jsonb;
--     alter table public.runs add column if not exists run_id  uuid;
--     alter table public.runs add column if not exists cognome text;
-- Per sapere come sta la tabella vera: npm run supabase

alter table public.runs enable row level security;

-- Una riga per partita, non una per spedizione.
--
-- Il gioco spedisce due volte: alla conferma delle previsioni e quando assegna
-- i moltiplicatori del quiz, che arrivano giorni dopo. Le due spedizioni
-- portano lo stesso run_id, e la seconda riscrive la prima invece di
-- aggiungere una riga.
create unique index if not exists runs_run_id_key on public.runs (run_id);

-- 1 settembre 2026: qui c'erano due policy dirette (insert e update per anon,
-- entrambe "with check (true)") e il motore scriveva con un POST diretto su
-- /rest/v1/runs con "Prefer: resolution=merge-duplicates" (upsert lato
-- PostgREST). Sembrava a posto — le policy c'erano, i permessi pure — ma ogni
-- invio veniva rifiutato con 401 / 42501 "new row violates row-level security
-- policy for table runs", anche il primissimo di una partita mai vista prima.
--
-- Il motivo: "resolution=merge-duplicates" fa scattare in Postgres un
-- INSERT ... ON CONFLICT (run_id) DO UPDATE, e per sapere se una riga con
-- quel run_id esiste gia' Postgres deve poterla LEGGERE secondo le policy
-- RLS di chi sta chiamando — anche se poi non serve rileggerla per davvero
-- ("return=minimal" evita solo di rispedirla nella risposta, non evita il
-- controllo). Senza una policy di select per anon, quella lettura e' vietata
-- e l'intero upsert viene rifiutato — sempre, non solo sui duplicati.
--
-- Dare ad anon una policy di select larga come le altre ("using (true)")
-- avrebbe risolto, ma avrebbe anche reso leggibile l'intera tabella con un
-- semplice GET (nome, cognome, email, previsioni di chiunque): esattamente
-- quello che il regolamento promette non succeda ("la chiave nel sito puo'
-- solo inserire, non legge, non modifica, non cancella"). La soluzione che
-- non rompe quella promessa: una funzione SECURITY DEFINER, che gira con i
-- permessi di chi possiede la tabella (bypassa la RLS di chi la chiama) e fa
-- l'upsert al posto del client. Ad anon si concede solo il permesso di
-- eseguire la funzione, non di leggere o scrivere la tabella direttamente.
drop policy if exists "chiunque puo inserire la propria schedina" on public.runs;
drop policy if exists "chiunque puo aggiornare la propria schedina" on public.runs;
revoke insert, update, select, delete on public.runs from anon;

-- Se la funzione esisteva gia' con un parametro per campo (una versione di
-- passaggio di questa stessa correzione, il 1 settembre 2026): dentro la
-- funzione un identificatore come "run_id" risultava ambiguo — poteva essere
-- il parametro o la colonna della tabella, e Postgres si rifiutava con 42702
-- "column reference is ambiguous" — proprio perche' i nomi dei parametri
-- ricalcavano apposta quelli del payload. Va tolta prima di ricrearla con un
-- unico parametro jsonb, che non ha questo problema:
drop function if exists public.upsert_run(
  uuid, text, text, text, text, text, text, text, text, integer,
  jsonb, jsonb, jsonb, jsonb, text, text
);

create or replace function public.upsert_run(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.runs (
    run_id, nome, cognome, genere, store, reparto, anni, device, stile,
    punti, picks, flags, quiz, runner, email, versione
  ) values (
    (p->>'run_id')::uuid,
    p->>'nome',
    p->>'cognome',
    p->>'genere',
    p->>'store',
    p->>'reparto',
    p->>'anni',
    p->>'device',
    p->>'stile',
    (p->>'punti')::integer,
    coalesce(p->'picks', '{}'::jsonb),
    coalesce(p->'flags', '{}'::jsonb),
    coalesce(p->'quiz', '{}'::jsonb),
    coalesce(p->'runner', '{}'::jsonb),
    p->>'email',
    p->>'versione'
  )
  on conflict (run_id) do update set
    nome = excluded.nome, cognome = excluded.cognome, genere = excluded.genere,
    store = excluded.store, reparto = excluded.reparto, anni = excluded.anni,
    device = excluded.device, stile = excluded.stile, punti = excluded.punti,
    picks = excluded.picks, flags = excluded.flags, quiz = excluded.quiz,
    runner = excluded.runner, email = excluded.email, versione = excluded.versione;
end;
$$;

revoke all on function public.upsert_run(jsonb) from public;
grant execute on function public.upsert_run(jsonb) to anon;

-- Nessuna policy di select sulla tabella: di default RLS nega tutto quello
-- che non e' esplicitamente permesso, e ora anon non ha nemmeno il grant di
-- base per provarci. L'unica porta e' la funzione qui sopra, che il motore
-- chiama con POST /rest/v1/rpc/upsert_run (game/engine.js, invia()).


-- ---------------------------------------------------------------------------
-- Cosa contiene una schedina, e perche'
--
-- Il regolamento dentro al gioco (zona 3 della lobby, sezione PRIVACY E DATI)
-- elenca esattamente questi campi: se qui si aggiunge o si toglie qualcosa, va
-- aggiornato anche li'. Quello che il giocatore legge deve essere quello che il
-- gioco fa davvero.
--
--   nome      il nickname scelto in [S0]. Non serve il nome vero: il gioco lo
--             usa solo per rivolgersi al giocatore e per la classifica
--   cognome   facoltativo, chiesto subito dopo il nome in [S0]. Serve solo a
--             distinguere in classifica due giocatori con lo stesso nome:
--             chi la compila conta "Nome" + iniziale ("Lorenzo B."), il gioco
--             non lo fa da solo (come per il resto dei punteggi, vedi 'punti')
--   genere    serve al testo, che si declina ("sei pronto" / "sei pronta")
--   store     classifica per punto vendita
--   reparto   classifica per categoria
--   anni      classifica per anzianita'. E' il CODICE della fascia, non
--             l'etichetta: 0 = 0-2 anni, 1 = 3-7, 2 = 8-12, 3 = piu' di 12
--   device    dato di colore, chiesto in [S0]
--   stile     decide battute, sprite e perk del quiz
--   punti     ricalcolati dalle risposte, non accumulati
--   picks     le risposte date, per macroargomento
--   flags     due scelte di tono di [S2] e [S4]
--   quiz      livelli del quiz di Peter e moltiplicatori assegnati
--   runner    il record dell'Apple Campus Run. Come entri in classifica non e'
--             deciso: il dato viaggia comunque, cosi' la decisione si puo'
--             prendere dopo invece che perdere le corse gia' fatte
--   email     facoltativa: la lascia il giocatore dopo il teleprompter, e
--             serve solo a mandargli i risultati finali. Chi salta la
--             schermata manda null
--   versione  la versione dello script con cui e' stata giocata
--   run_id    l'id della partita, generato dal gioco: tiene insieme le due
--             spedizioni della stessa partita in una riga sola
--
-- Non c'e' altro: l'email solo se il giocatore l'ha lasciata, e niente
-- identificativi del dispositivo, niente indirizzi IP raccolti dal gioco.
--
-- ---------------------------------------------------------------------------
-- Chi puo' leggere
--
-- La chiave che sta nel sito e' la anon e puo' solo chiamare la funzione
-- upsert_run qui sopra: nessun grant diretto sulla tabella, quindi nessun
-- modo di leggerla, modificarla o cancellarla scavalcando la funzione. Le
-- schedine si leggono dal pannello di Supabase, cioe' solo dagli organizzatori
-- che hanno le credenziali del progetto. Per verificarlo dal vivo, con la
-- chiave anon:
--
--   POST  /rest/v1/rpc/upsert_run              -> 200/204 (l'unica via di scrittura)
--   GET   /rest/v1/runs?select=*               -> 401     (nessun grant di select)
--   PATCH /rest/v1/runs?run_id=eq...           -> 401     (nessun grant di update)
--   DELETE /rest/v1/runs?run_id=eq...          -> 401     (nessun grant di delete)
--
-- ---------------------------------------------------------------------------
-- Cancellazione dei dati a fine iniziativa
--
-- Il regolamento promette che i dati vengono cancellati entro 30 giorni dalla
-- fine dell'iniziativa. Non e' automatico: va fatto a mano dall'SQL Editor,
-- con le credenziali del progetto.
--
--   -- 1. controlla cosa stai per cancellare
--   select count(*), min(submitted_at), max(submitted_at) from public.runs;
--
--   -- 2. se serve, esporta prima (Table Editor -> Export -> CSV)
--
--   -- 3. cancella tutto
--   delete from public.runs;
--
-- Per cancellare la schedina di una singola persona che lo chiede (e' un suo
-- diritto, ed e' scritto nel regolamento):
--
--   delete from public.runs where lower(nome) = lower('nickname');


-- ===========================================================================
-- Classifica dell'Apple Campus Run
--
-- Una riga per giocatore, e dentro il MIGLIOR punteggio: non lo storico delle
-- partite. Il giocatore e' quello che ha gia' il gioco (player_id e' lo stesso
-- run_id della schedina, player_name il nickname scelto in [S0]): la corsa non
-- chiede un nome nuovo a nessuno.

create table if not exists public.runner_leaderboard (
  player_id    text primary key,
  player_name  text not null,
  best_score   integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- La classifica si legge in ordine di punteggio, e a parita' e' davanti chi ci
-- e' arrivato prima. Senza questo indice ogni apertura della classifica
-- ordinerebbe tutta la tabella.
create index if not exists runner_leaderboard_ordine
  on public.runner_leaderboard (best_score desc, updated_at asc);

alter table public.runner_leaderboard enable row level security;

-- Questa tabella, al contrario di runs, si LEGGE: e' una classifica, sta
-- dentro il gioco e la vedono tutti. Non c'e' niente di personale — un
-- nickname e un punteggio.
drop policy if exists "la classifica si legge" on public.runner_leaderboard;
create policy "la classifica si legge"
  on public.runner_leaderboard for select to anon using (true);

-- Dal 5 settembre 2026 la chiave del sito NON scrive piu' direttamente sulla
-- classifica: passa dalle funzioni runner_inizio / runner_fine / runner_rinomina
-- piu' sotto, che controllano che il punteggio sia possibile. Le due policy di
-- scrittura di prima vanno tolte (chi le lasciasse riaprirebbe la porta a
-- "punteggio = 99999" scritto dalla console del browser).
drop policy if exists "il punteggio si scrive" on public.runner_leaderboard;
drop policy if exists "il punteggio si aggiorna" on public.runner_leaderboard;

-- Il tempo della partita migliore, in secondi. E' la terza colonna della
-- classifica: si mostra e basta, l'ordine resta per punti. Il gioco prova a
-- scriverlo e, se questa colonna non c'e' ancora, riprova senza — quindi
-- funziona anche prima di lanciare questa riga, solo senza tempo.
alter table public.runner_leaderboard add column if not exists best_time_s integer;

-- Il nome in classifica e' un nick scelto dal giocatore alla prima partita,
-- ed e' UNICO (senza distinzione di maiuscole): due "Marco" in tabella non si
-- distinguono, ed e' il motivo per cui il nick esiste. Il gioco controlla
-- prima di salvare, ma due che firmano nello stesso istante li ferma solo
-- l'indice. Prima di crearlo i doppioni gia' presenti vanno sciolti, se no
-- la creazione fallisce: si tiene il nome a chi ha il punteggio piu' alto e
-- agli altri si appende un numero.
do $$
declare r record; n int;
begin
  for r in
    select lower(player_name) as chiave, array_agg(player_id order by best_score desc, updated_at asc) as ids
    from public.runner_leaderboard
    group by lower(player_name) having count(*) > 1
  loop
    for n in 2 .. array_length(r.ids, 1) loop
      update public.runner_leaderboard
        set player_name = player_name || ' ' || n
        where player_id = r.ids[n];
    end loop;
  end loop;
end $$;

create unique index if not exists runner_leaderboard_nick
  on public.runner_leaderboard (lower(player_name));

-- Il punteggio non scende mai. Il gioco gia' controlla di scrivere solo quando
-- il punteggio e' piu' alto, ma due partite chiuse nello stesso momento (o una
-- risposta che arriva in ritardo) potrebbero riscrivere il record con uno
-- peggiore: qui la regola e' del database, e non si puo' aggirare.
-- Il tempo segue il punteggio: e' quello della partita migliore, quindi resta
-- il vecchio se il punteggio non e' stato battuto.
create or replace function public.runner_solo_meglio()
returns trigger language plpgsql as $$
begin
  if new.best_score < old.best_score then
    new.best_score := old.best_score;
    new.best_time_s := old.best_time_s;
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists runner_solo_meglio on public.runner_leaderboard;
create trigger runner_solo_meglio
  before update on public.runner_leaderboard
  for each row execute function public.runner_solo_meglio();

-- ===========================================================================
-- Il server non si fida del telefono (5 settembre 2026)
-- ===========================================================================
-- Un giocatore ha aperto "Ispeziona elemento", cambiato la velocita' e tolto
-- gli scalini, e ha fatto un punteggio altissimo; un altro ha usato un bot.
-- Il gioco gira per forza sul telefono (e' li' che si corre), quindi non si
-- puo' impedire di manometterlo: si puo' pero' RIFIUTARE quello che non e'
-- possibile. Tre cose, tutte qui nel database, dove il browser non arriva:
--
--   1. ogni partita si ANNUNCIA prima di cominciare (runner_inizio) e il
--      server segna l'ora: a fine partita (runner_fine) il tempo lo misura
--      lui, non il telefono;
--   2. il punteggio deve stare sotto quello che un giocatore PERFETTO puo'
--      fare in quel tempo (runner_massimo: la curva dei livelli, i punti per
--      metro, un margine) e sotto un tetto assoluto (runner_tetto);
--   3. troppe partite in un minuto dallo stesso giocatore vengono rifiutate
--      (un bot che ricomincia in continuazione).
--
-- Ogni partita, accettata o no, resta in runner_partite con il motivo: e' il
-- registro per vedere chi ci prova (query in fondo).
--
-- Che cosa NON fa: non riconosce un bot che gioca davvero, con punteggi
-- possibili. Per quello servirebbe rigiocare la partita sul server mossa per
-- mossa, un altro progetto.

create table if not exists public.runner_partite (
  id           uuid primary key default gen_random_uuid(),
  player_id    text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  punti        integer,
  secondi      integer,           -- come li ha contati il telefono
  durata_s     integer,           -- come li ha contati il server
  esito        text,              -- 'ok' | 'rifiutata'
  motivo       text
);
create index if not exists runner_partite_giocatore
  on public.runner_partite (player_id, started_at desc);
alter table public.runner_partite enable row level security;
-- nessuna policy per anon: si entra solo dalle funzioni qui sotto
revoke all on public.runner_partite from anon;

-- Il tetto assoluto. Il record vero, a settembre 2026, e' sui 13.000: sopra
-- questo numero non entra nessuno, qualunque cosa dica il telefono. Si cambia
-- qui, in un posto solo.
create or replace function public.runner_tetto() returns integer
language sql immutable as $$ select 40000 $$;

-- Quanto puo' fare AL MASSIMO un giocatore perfetto in tanti secondi.
-- Il modello e' quello del gioco: la velocita' parte da 0.62 metri al
-- secondo e sale di 0.20 a ogni livello (1000 punti), fino a dieci scalini;
-- un giocatore che prende OGNI anello e OGNI prodotto raccoglie circa 215
-- punti al metro (gruppo da 6 anelli blu piu' un prodotto ogni 0.75 metri,
-- piu' i 4 punti al metro della distanza). Qui si usa 280 al metro — un
-- terzo in piu' — e 500 punti di abbuono, cosi' la fortuna non fa mai
-- rifiutare una partita onesta. Un tabellone da 40.000 vuole almeno un
-- minuto e mezzo di gioco vero.
create or replace function public.runner_massimo(secondi numeric) returns integer
language plpgsql immutable as $$
declare
  resto  numeric := greatest(secondi, 0);
  punti  numeric := 500;
  ritmo  constant numeric := 280;   -- punti al metro, con margine
  liv    integer;
  vel    numeric;
  serve  numeric;
begin
  for liv in 0..9 loop
    vel   := 0.62 + 0.20 * liv;
    serve := 1000 / (ritmo * vel);           -- secondi per riempire il livello
    if resto < serve then
      return floor(punti + resto * ritmo * vel);
    end if;
    punti := punti + 1000;
    resto := resto - serve;
  end loop;
  return floor(punti + resto * ritmo * 2.62);
end $$;

-- 1. La partita si annuncia. Torna l'id da restituire a fine partita.
create or replace function public.runner_inizio(p_player_id text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_recenti integer;
begin
  if p_player_id is null or length(p_player_id) < 4 or length(p_player_id) > 80 then
    raise exception 'giocatore non valido' using errcode = '22023';
  end if;
  -- un bot che ricomincia in continuazione: piu' di otto partite in un minuto
  -- non le fa nessuno con le dita
  select count(*) into v_recenti from public.runner_partite
    where player_id = p_player_id and started_at > now() - interval '60 seconds';
  if v_recenti >= 8 then
    raise exception 'troppe partite' using errcode = '54000';
  end if;
  insert into public.runner_partite (player_id) values (p_player_id) returning id into v_id;
  return v_id;
end $$;

-- 2. La partita si chiude. Decide il server: torna {ok, motivo, best_score,
--    best_time_s}. Un punteggio rifiutato NON e' un errore HTTP (il gioco va
--    avanti e mostra la classifica com'era): e' una risposta con ok=false.
--    L'unico errore vero e' il nick gia' preso (23505 -> 409), che il gioco
--    gestisce riaprendo la finestra del nick.
create or replace function public.runner_fine(
  p_partita uuid, p_player_id text, p_nick text, p_punti integer, p_secondi integer)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r        public.runner_partite%rowtype;
  durata   numeric;
  v_motivo text := null;
  v_best   integer;
  v_tempo  integer;
begin
  select * into r from public.runner_partite where id = p_partita and player_id = p_player_id;
  if not found then
    return json_build_object('ok', false, 'motivo', 'partita sconosciuta');
  end if;
  if r.finished_at is not null then
    return json_build_object('ok', false, 'motivo', 'partita gia'' chiusa');
  end if;

  durata := extract(epoch from (now() - r.started_at));

  if p_punti is null or p_punti < 0 then v_motivo := 'punteggio non valido';
  elsif durata < 3 then v_motivo := 'partita troppo corta';
  elsif p_secondi is not null and p_secondi > durata + 8 then v_motivo := 'tempo del telefono piu'' lungo di quello vero';
  elsif p_punti > public.runner_tetto() then v_motivo := 'sopra il tetto';
  elsif p_punti > public.runner_massimo(durata + 5) then v_motivo := 'impossibile in ' || floor(durata) || ' s';
  end if;

  update public.runner_partite
     set finished_at = now(), punti = p_punti, secondi = p_secondi,
         durata_s = floor(durata), esito = case when v_motivo is null then 'ok' else 'rifiutata' end,
         motivo = v_motivo
   where id = p_partita;

  if v_motivo is null then
    insert into public.runner_leaderboard (player_id, player_name, best_score, best_time_s, updated_at)
      values (p_player_id, coalesce(nullif(p_nick, ''), 'Anonimo'), p_punti,
              least(coalesce(p_secondi, floor(durata)::integer), floor(durata)::integer), now())
      on conflict (player_id) do update
        set player_name = excluded.player_name,
            best_score  = excluded.best_score,
            best_time_s = excluded.best_time_s,
            updated_at  = excluded.updated_at;   -- il trigger tiene il vecchio se non e' battuto
  end if;

  select best_score, best_time_s into v_best, v_tempo
    from public.runner_leaderboard where player_id = p_player_id;

  return json_build_object('ok', v_motivo is null, 'motivo', v_motivo,
                           'best_score', coalesce(v_best, 0), 'best_time_s', v_tempo);
end $$;

-- 3. Solo il nick. Se una riga ancora non c'e' non c'e' niente da rinominare:
--    il nick nuovo entrera' con il primo punteggio.
create or replace function public.runner_rinomina(p_player_id text, p_nick text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_nick is null or p_nick !~ '^[A-Z0-9 _-]{2,10}$' then
    raise exception 'nick non valido' using errcode = '22023';
  end if;
  update public.runner_leaderboard set player_name = p_nick where player_id = p_player_id;
end $$;

revoke all on function public.runner_inizio(text) from public;
revoke all on function public.runner_fine(uuid, text, text, integer, integer) from public;
revoke all on function public.runner_rinomina(text, text) from public;
grant execute on function public.runner_inizio(text) to anon;
grant execute on function public.runner_fine(uuid, text, text, integer, integer) to anon;
grant execute on function public.runner_rinomina(text, text) to anon;

-- Chi ci prova: le partite rifiutate degli ultimi giorni.
--   select started_at, player_id, punti, durata_s, motivo
--     from public.runner_partite where esito = 'rifiutata'
--     order by started_at desc limit 50;
-- Per togliere dalla classifica chi e' gia' entrato barando, prima di oggi:
--   delete from public.runner_leaderboard where lower(player_name) = 'nick';
-- Pulizia del registro (cresce di una riga a partita):
--   delete from public.runner_partite where started_at < now() - interval '60 days';

-- Per cancellare la classifica a fine iniziativa, come per le schedine:
--   delete from public.runner_leaderboard;

-- ══════════════════════════════════════════════════════════════════════
-- Il codice di ripresa: rileggere la propria partita da un altro telefono
--
-- Il salvataggio del gioco vive nel browser, e basta cambiare telefono (o
-- perdere il localStorage) per non ritrovarlo piu'. La schedina pero' e' qui:
-- chi ha confermato le previsioni ha una riga in runs, e quella riga contiene
-- tutto quello che serve a rimetterlo davanti al countdown.
--
-- La chiave e' il run_id, che il gioco genera una volta e tiene con la
-- partita. E' un UUID: non si indovina, esattamente come un link privato. Chi
-- ce l'ha e' il proprietario della partita — non serve nessuna login.
--
-- Perche' una funzione e non una policy di select: dare ad anon il permesso di
-- leggere runs renderebbe l'INTERA tabella scaricabile con una GET (nomi,
-- reparti e previsioni di tutti). La funzione, come upsert_run, gira con i
-- permessi del proprietario e restituisce UNA riga SOLO a chi presenta il
-- codice esatto.
create or replace function public.riprendi_run(codice uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  -- 'id' e 'submitted_at' sono roba della tabella, non della partita: al gioco
  -- non servono e non c'e' motivo di farli uscire.
  select to_jsonb(r) - 'id' - 'submitted_at'
  from public.runs r
  where r.run_id = codice
  limit 1;
$$;

-- Nessun permesso di lettura sulla tabella: solo il diritto di chiamare la
-- funzione, che senza il codice giusto non restituisce niente.
revoke all on function public.riprendi_run(uuid) from public, anon;
grant execute on function public.riprendi_run(uuid) to anon;

-- Verifica dal vivo (sostituisci <CODICE> con un run_id vero):
--   POST /rest/v1/rpc/riprendi_run   {"codice":"<CODICE>"}   -> la riga
--   POST /rest/v1/rpc/riprendi_run   {"codice":"<a caso>"}   -> null
--   GET  /rest/v1/runs?select=*                              -> 401, come prima
--
-- Per ritrovare il codice di chi ha perso il telefono e scrive per chiedere
-- aiuto (l'identita' la verifichi tu, non il gioco):
--   select run_id, nome, cognome, store, reparto, punti, submitted_at
--   from public.runs
--   where lower(nome) = lower('Marco')
--   order by submitted_at desc;
