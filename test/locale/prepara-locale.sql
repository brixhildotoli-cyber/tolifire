-- F14.9 - SOLO per il database di prova LOCALE dello smoke test
-- (container toli-smoke-db, copia del backup). NON eseguire in produzione
-- né sul progetto di prova di F14.8: lì gli utenti di prova si creano dal
-- sito (Impostazioni > Team) con le loro password. Lo esegue
-- avvia-db-locale.sh come supabase_admin.
--
-- 1. auth.uid(), auth.role(), auth.jwt() come su Supabase: l'immagine locale
-- legge solo request.jwt.claim.sub, che PostgREST 12+ non imposta più (manda
-- request.jwt.claims). Senza questo ruolo_corrente() resta vuoto e le RLS
-- negano tutto.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;

-- 2. Utenti di prova.
-- Per ogni ruolo che nel backup non ha un utente attivo (es. contabile)
-- crea l'utente di prova "Prova Smoke <ruolo>" con email
-- smoke.<ruolo>@prova.invalid (.invalid: dominio che non esiste).
-- Il login nel locale lo simula lo smoke test (nessuna password).
set session_replication_role = replica;
with ruoli_test(ruolo) as (
  values ('titolare'), ('informatico'), ('capo_tecnico'), ('segreteria'),
         ('contabile'), ('tecnico'), ('commerciale'), ('rappresentante'),
         ('ingegnere')
), mancanti as (
  select r.ruolo, gen_random_uuid() as id
  from ruoli_test r
  where not exists (select 1 from public.utenti u where u.ruolo = r.ruolo and u.attivo is not false)
), auth_ins as (
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  select id, 'authenticated', 'authenticated', 'smoke.' || ruolo || '@prova.invalid', now(), now()
  from mancanti
  returning id
)
insert into public.utenti (id, nome, cognome, email, ruolo, attivo)
select m.id, 'Prova', 'Smoke ' || m.ruolo, 'smoke.' || m.ruolo || '@prova.invalid', m.ruolo, true
from mancanti m
join auth_ins a on a.id = m.id;
set session_replication_role = origin;
select ruolo, count(*) as utenti_attivi from public.utenti where attivo is not false group by ruolo order by ruolo;
