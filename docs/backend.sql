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
