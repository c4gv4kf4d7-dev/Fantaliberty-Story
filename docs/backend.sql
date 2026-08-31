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
--     alter table public.runs add column if not exists quiz   jsonb;
--     alter table public.runs add column if not exists email  text;
--     alter table public.runs add column if not exists runner jsonb;
--     alter table public.runs add column if not exists run_id uuid;
-- Per sapere come sta la tabella vera: npm run supabase

alter table public.runs enable row level security;

-- Il gioco e' un sito statico: la chiave che sta nel browser puo' solo
-- INSERIRE. Non puo' leggere le altre schedine, non puo' modificarle, non puo'
-- cancellarle. La classifica si legge dal pannello di Supabase o con la chiave
-- service_role, che nel sito non c'e'.
drop policy if exists "chiunque puo inserire la propria schedina" on public.runs;
create policy "chiunque puo inserire la propria schedina"
  on public.runs for insert to anon with check (true);

-- Una riga per partita, non una per spedizione.
--
-- Il gioco spedisce due volte: alla conferma delle previsioni e quando assegna
-- i moltiplicatori del quiz, che arrivano giorni dopo. Le due spedizioni
-- portano lo stesso run_id, e la seconda riscrive la prima invece di
-- aggiungere una riga (PostgREST: Prefer: resolution=merge-duplicates).
--
-- Servono due cose: l'indice unico su cui agganciare l'upsert, e il permesso
-- di aggiornare. Il permesso e' largo come quello di inserire — chi conosce un
-- run_id puo' riscrivere quella riga — ma il run_id e' un uuid casuale che sta
-- solo nel telefono di chi gioca, e non compare da nessuna parte.
create unique index if not exists runs_run_id_key on public.runs (run_id);

drop policy if exists "chiunque puo aggiornare la propria schedina" on public.runs;
create policy "chiunque puo aggiornare la propria schedina"
  on public.runs for update to anon using (true) with check (true);

-- Nessuna policy di select: di default RLS nega tutto quello che non e'
-- esplicitamente permesso. L'upsert funziona lo stesso, perche' con
-- "return=minimal" non deve rileggere niente.


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
-- La chiave che sta nel sito e' la anon e puo' solo INSERIRE (vedi la policy
-- qui sopra). Le schedine si leggono dal pannello di Supabase, cioe' solo dagli
-- organizzatori che hanno le credenziali del progetto. Per verificarlo dal
-- vivo, con la chiave anon:
--
--   POST   /rest/v1/runs                      -> 201
--   GET    /rest/v1/runs?select=*             -> []      (nessuna policy di select)
--   PATCH  /rest/v1/runs?id=eq...             -> []      (nessuna policy di update)
--   DELETE /rest/v1/runs?id=eq...             -> []      (nessuna policy di delete)
--   POST   con Prefer: return=representation  -> 401     (non puo' rileggere)
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

drop policy if exists "il punteggio si scrive" on public.runner_leaderboard;
create policy "il punteggio si scrive"
  on public.runner_leaderboard for insert to anon with check (true);

drop policy if exists "il punteggio si aggiorna" on public.runner_leaderboard;
create policy "il punteggio si aggiorna"
  on public.runner_leaderboard for update to anon using (true) with check (true);

-- Il punteggio non scende mai. Il gioco gia' controlla di scrivere solo quando
-- il punteggio e' piu' alto, ma due partite chiuse nello stesso momento (o una
-- risposta che arriva in ritardo) potrebbero riscrivere il record con uno
-- peggiore: qui la regola e' del database, e non si puo' aggirare.
create or replace function public.runner_solo_meglio()
returns trigger language plpgsql as $$
begin
  if new.best_score < old.best_score then
    new.best_score := old.best_score;
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists runner_solo_meglio on public.runner_leaderboard;
create trigger runner_solo_meglio
  before update on public.runner_leaderboard
  for each row execute function public.runner_solo_meglio();

-- Per cancellare la classifica a fine iniziativa, come per le schedine:
--   delete from public.runner_leaderboard;
