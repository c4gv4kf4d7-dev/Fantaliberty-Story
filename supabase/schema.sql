-- ═══════════════════════════════════════════════════════════════════════════
-- FantaLiberty · schema Supabase per l'invio dei risultati
-- ═══════════════════════════════════════════════════════════════════════════
-- Da eseguire una sola volta nel SQL Editor del progetto Supabase.
-- Lo script è idempotente: puoi rilanciarlo senza rompere nulla.
--
-- Modello di sicurezza:
--   · la pagina pubblica usa SOLO la chiave "anon" (è pensata per stare in
--     chiaro nell'HTML: non dà accesso ai dati, è la RLS a decidere)
--   · l'unico permesso concesso ad anon è INSERT su public.previsioni
--   · nessuna policy di SELECT/UPDATE/DELETE ⇒ nessuno può leggere, modificare
--     o cancellare gli invii dal browser: si leggono solo dalla dashboard
--     Supabase o con la service_role key (che NON va mai messa nell'HTML)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Tabella degli invii ────────────────────────────────────────────────────
create table if not exists public.previsioni (
  id                uuid primary key default gen_random_uuid(),
  creato_il         timestamptz not null default now(),
  edizione          text        not null default 'wwdc26',

  -- identità giocatore
  nome              text,
  cognome           text,
  reparto           text,
  seniority         text,
  iphone            text,
  store             text,
  email             text,

  -- esito del gioco
  profilo           text,               -- badge calcolato lato client
  newton_spesi      integer,
  budget            integer,
  previsioni        jsonb  not null default '[]'::jsonb,  -- [{id,nome,costo,prob}]
  previsioni_testo  text,               -- stessa lista in formato leggibile

  -- diagnostica
  inviato_il        timestamptz,        -- orario del device
  user_agent        text,

  constraint previsioni_edizione_chk    check (edizione = 'wwdc26'),
  constraint previsioni_nome_len        check (char_length(coalesce(nome,''))     <= 80),
  constraint previsioni_cognome_len     check (char_length(coalesce(cognome,''))  <= 80),
  constraint previsioni_email_len       check (char_length(coalesce(email,''))    <= 160),
  constraint previsioni_reparto_len     check (char_length(coalesce(reparto,''))  <= 80),
  constraint previsioni_store_len       check (char_length(coalesce(store,''))    <= 80),
  constraint previsioni_profilo_len     check (char_length(coalesce(profilo,''))  <= 60),
  constraint previsioni_testo_len       check (char_length(coalesce(previsioni_testo,'')) <= 4000),
  constraint previsioni_ua_len          check (char_length(coalesce(user_agent,'')) <= 300),
  constraint previsioni_newton_chk      check (newton_spesi is null or newton_spesi between 0 and 200),
  constraint previsioni_lista_chk       check (jsonb_typeof(previsioni) = 'array'
                                               and jsonb_array_length(previsioni) <= 60)
);

comment on table public.previsioni is
  'Invii del gioco FantaLiberty (template-wwdc26.html). Inserimento pubblico via anon key, lettura solo con service_role / dashboard.';

create index if not exists previsioni_edizione_creato_idx
  on public.previsioni (edizione, creato_il desc);
create index if not exists previsioni_email_idx
  on public.previsioni ((lower(email)));

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table public.previsioni enable row level security;

-- Solo INSERT per il pubblico (anon = chiave nell'HTML, authenticated per
-- sicurezza se un domani si aggiunge il login).
drop policy if exists "invio pubblico previsioni" on public.previsioni;
create policy "invio pubblico previsioni"
  on public.previsioni
  for insert
  to anon, authenticated
  with check (
    edizione = 'wwdc26'
    and coalesce(nome, '')    <> ''
    and coalesce(cognome, '') <> ''
    and jsonb_typeof(previsioni) = 'array'
    and jsonb_array_length(previsioni) between 1 and 60
  );

-- Nessuna policy di SELECT/UPDATE/DELETE: volutamente assente.

revoke all on public.previsioni from anon, authenticated;
grant insert on public.previsioni to anon, authenticated;

-- ── Vista di comodo: ultimo invio per ogni giocatore ───────────────────────
-- Ogni invio crea una riga nuova (un giocatore può rigiocare); questa vista
-- tiene solo il più recente per email. Non è esposta ad anon.
create or replace view public.previsioni_ultime as
  select distinct on (edizione, lower(coalesce(email, id::text))) *
  from public.previsioni
  order by edizione, lower(coalesce(email, id::text)), creato_il desc;

revoke all on public.previsioni_ultime from anon, authenticated;

-- ── Export CSV rapido (da lanciare nel SQL Editor) ─────────────────────────
-- select nome, cognome, reparto, seniority, store, email, profilo,
--        newton_spesi, previsioni_testo, creato_il
-- from public.previsioni_ultime
-- order by creato_il desc;

-- ── Pulizia dati personali (vedi note legali: entro 72h dal Keynote) ───────
-- update public.previsioni
--    set nome = null, cognome = null, email = null, user_agent = null
--  where creato_il < now() - interval '72 hours';
