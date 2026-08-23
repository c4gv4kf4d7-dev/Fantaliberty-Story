-- ═══════════════════════════════════════════════════════════════════════════
-- FantaLiberty — archivio risposte su Supabase
--
-- COSA FARE: Supabase → il tuo progetto → SQL Editor → incolla tutto → Run.
-- Non serve altro: crea la tabella, le protezioni e le viste di spoglio.
--
-- ⚠️  LEGGI QUESTO
-- La chiave `anon` di Supabase è pubblica: finisce dentro il codice del sito
-- ed è visibile a chiunque apra gli strumenti da sviluppatore. Le policy qui
-- sotto fanno in modo che con quella chiave si possa SOLO inserire, mai
-- leggere. Senza, chiunque potrebbe scaricarsi le email di tutti e — molto
-- peggio — leggere le previsioni degli altri a gioco ancora aperto.
-- Per leggere i dati usi la dashboard o la chiave `service_role`, che resta
-- privata e non va MAI messa nel sito.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tabella ───────────────────────────────────────────────────────────────
create table if not exists public.risposte (
  id          bigint generated always as identity primary key,
  creato_il   timestamptz not null default now(),

  -- Permette di tenere tutte le edizioni nella stessa tabella: è ciò che
  -- rende possibile l'albo d'oro negli anni senza rimettere mano a niente.
  edizione    text        not null,

  nome        text        not null,
  cognome     text        not null,
  reparto     text,
  seniority   text,
  iphone      text,
  store       text,
  email       text,
  profilo     text,                    -- il badge, calcolato da computeBadge()
  previsioni  text[]      not null default '{}',

  constraint nome_non_vuoto    check (length(trim(nome))    > 0),
  constraint cognome_non_vuoto check (length(trim(cognome)) > 0)
);

comment on table public.risposte is
  'Schedine FantaLiberty. Inserimento pubblico via chiave anon; lettura solo con service_role.';

create index if not exists risposte_edizione_idx on public.risposte (edizione);

-- ─── Protezioni ────────────────────────────────────────────────────────────
alter table public.risposte enable row level security;

-- Nessuna policy di SELECT/UPDATE/DELETE: con RLS attivo e nessuna policy,
-- quelle operazioni sono negate per default alla chiave anon.
drop policy if exists "chiunque può inserire" on public.risposte;
create policy "chiunque può inserire"
  on public.risposte for insert
  to anon, authenticated
  with check (true);

-- Cintura e bretelle: revoca esplicita, così anche se un domani qualcuno
-- aggiungesse una policy di lettura per sbaglio, il permesso non c'è.
revoke select, update, delete on public.risposte from anon;
grant insert on public.risposte to anon;

-- ─── Viste per lo spoglio ──────────────────────────────────────────────────
-- Non accessibili con la chiave anon: servono a te dalla dashboard.

-- Una riga per giocatore, con il numero di previsioni scelte.
create or replace view public.v_partecipanti as
select
  id, creato_il, edizione,
  nome || ' ' || cognome as giocatore,
  reparto, store, seniority, iphone, profilo,
  cardinality(previsioni) as n_previsioni,
  email
from public.risposte
order by creato_il;

-- Quante volte è stata scelta ogni previsione: serve al moltiplicatore
-- rarità, e dice subito quali sono le "trappole del gregge".
create or replace view public.v_conteggio_previsioni as
select
  edizione,
  unnest(previsioni)      as previsione,
  count(*)                as scelte,
  round(100.0 * count(*) / max(count(*)) over (partition by edizione), 1) as pct_sul_max
from public.risposte
group by edizione, previsione
order by edizione, scelte desc;

-- Distribuzione dei badge: il dato narrativo da mostrare alla rivelazione.
create or replace view public.v_profili as
select edizione, coalesce(profilo,'—') as profilo, count(*) as giocatori
from public.risposte
group by edizione, profilo
order by edizione, giocatori desc;

-- Partecipazione per reparto e per store, utile durante la campagna per
-- capire dove serve spingere.
create or replace view public.v_partecipazione as
select edizione, 'reparto' as tipo, coalesce(reparto,'—') as gruppo, count(*) as giocatori
from public.risposte group by edizione, reparto
union all
select edizione, 'store', coalesce(store,'—'), count(*)
from public.risposte group by edizione, store
order by 1, 2, 4 desc;

-- ─── Verifica ──────────────────────────────────────────────────────────────
-- Inserisce una riga finta e la rimuove. Se arriva fin qui senza errori,
-- la tabella è a posto.
do $$
begin
  insert into public.risposte (edizione, nome, cognome, reparto, store, profilo, previsioni)
  values ('test', 'Mario', 'Rossi', 'Shopping', 'Piazza Liberty', 'Scommettitore',
          array['Previsione A','Previsione B']);
  delete from public.risposte where edizione = 'test';
  raise notice 'OK: tabella, policy e viste create correttamente.';
end $$;
