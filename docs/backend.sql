-- Tabella delle schedine chiuse in [S6.03].
-- Da incollare nell'SQL Editor di Supabase (Database -> SQL Editor -> New query).
--
-- Il timestamp lo mette il server, non il client: lo script master chiede
-- "run.submitted_at = TIMESTAMP SERVER" proprio per questo, un orologio del
-- telefono spostato non deve poter cambiare l'ordine di arrivo.

create table if not exists public.runs (
  id           uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
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
  versione     text
);

alter table public.runs enable row level security;

-- Il gioco e' un sito statico: la chiave che sta nel browser puo' solo
-- INSERIRE. Non puo' leggere le altre schedine, non puo' modificarle, non puo'
-- cancellarle. La classifica si legge dal pannello di Supabase o con la chiave
-- service_role, che nel sito non c'e'.
drop policy if exists "chiunque puo inserire la propria schedina" on public.runs;
create policy "chiunque puo inserire la propria schedina"
  on public.runs for insert to anon with check (true);

-- Nessuna policy di select: di default RLS nega tutto quello che non e'
-- esplicitamente permesso.


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
--   anni      classifica per anzianita'
--   device    dato di colore, chiesto in [S0]
--   stile     decide battute, sprite e perk del quiz
--   punti     ricalcolati dalle risposte, non accumulati
--   picks     le risposte date, per macroargomento
--   flags     due scelte di tono di [S2] e [S4]
--   quiz      livelli del quiz di Peter e moltiplicatori assegnati
--   versione  la versione dello script con cui e' stata giocata
--
-- Non c'e' altro: niente email, niente identificativi del dispositivo, niente
-- indirizzi IP raccolti dal gioco.
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
