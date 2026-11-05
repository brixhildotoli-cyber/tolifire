#!/bin/zsh
# F14.9 - Database di prova LOCALE per lo smoke test (finché non c'è il
# progetto Supabase di prova di F14.8).
#
# Cosa fa (solo sul Mac, mai sulla produzione):
#  1. avvia un Postgres Supabase in Docker (container toli-smoke-db);
#  2. ci ripristina un backup del Metodo B di sql/BACKUP.md
#     (ruoli.sql, schema.sql, dati.sql);
#  3. esegue i file sql/NN-*.sql venuti dopo il backup (backup "preNN":
#     dal NN in poi; esclusi -ROLLBACK e -PROVA), oppure quelli indicati;
#  4. prepara il locale (test/locale/prepara-locale.sql: auth.uid() come su
#     Supabase, utenti di prova per i ruoli senza utente);
#  5. avvia PostgREST (container toli-smoke-rest) su 127.0.0.1:54399,
#     con le policy RLS vere del database;
#  6. scrive il segreto dei token di prova in test/.smoke-locale.env
#     (escluso da git, generato a ogni avvio, vale solo sul Mac).
#
# Uso:
#   zsh test/locale/avvia-db-locale.sh [cartella del backup] [file sql ...]
# Senza argomenti usa il backup più recente in ~/Backup-ToliFire.
# Per fermare tutto: zsh test/locale/ferma-db-locale.sh
set -e
export PATH="$PATH:$HOME/.docker/bin"

QUI=${0:A:h}
TEST=${QUI:h}
REPO=${TEST:h}
SQLDIR=${SMOKE_SQL_DIR:-$REPO/sql}
IMG_DB=${SMOKE_IMG_DB:-public.ecr.aws/supabase/postgres:17.11.0.004}
IMG_REST=${SMOKE_IMG_REST:-public.ecr.aws/supabase/postgrest:v16.4}
RETE=toli-smoke-net
DB=toli-smoke-db
REST=toli-smoke-rest
PORTA_REST=${SMOKE_PORTA_REST:-54399}

BACKUP=${1:-}
if [[ -z "$BACKUP" ]]; then
  BACKUP=$(ls -d $HOME/Backup-ToliFire/20*-pre* 2>/dev/null | sort | tail -1)
fi
[[ -n "$BACKUP" && -f "$BACKUP/schema.sql" && -f "$BACKUP/dati.sql" && -f "$BACKUP/ruoli.sql" ]] || {
  echo "Backup non trovato (servono ruoli.sql, schema.sql, dati.sql): $BACKUP"; exit 1; }
shift $(( $# > 0 ? 1 : 0 ))

# File SQL da eseguire dopo il backup
typeset -a EXTRA
if (( $# > 0 )); then
  for f in "$@"; do [[ "$f" = /* ]] && EXTRA+=("$f") || EXTRA+=("$SQLDIR/$f"); done
else
  NUM=$(basename "$BACKUP" | sed -n 's/.*-pre\([0-9][0-9]*\).*/\1/p')
  if [[ -n "$NUM" && -d "$SQLDIR" ]]; then
    for f in $(ls "$SQLDIR"/[0-9][0-9]-*.sql 2>/dev/null | sort); do
      n=$(basename "$f" | cut -c1-2)
      [[ "$f" == *-ROLLBACK.sql || "$f" == *-PROVA.sql ]] && continue
      (( 10#$n >= 10#$NUM )) && EXTRA+=("$f")
    done
  fi
fi

echo "Backup:   $BACKUP"
echo "SQL dopo: ${EXTRA[*]:-nessuno}"

docker rm -f $REST $DB >/dev/null 2>&1 || true
docker network create $RETE >/dev/null 2>&1 || true

PWDB=$(openssl rand -hex 16)
SEGRETO=$(openssl rand -hex 32)

docker run -d --name $DB --network $RETE -e POSTGRES_PASSWORD=$PWDB \
  -p 127.0.0.1:54398:5432 $IMG_DB >/dev/null
echo -n "Avvio del database"
for i in {1..90}; do
  if docker exec $DB pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && \
     docker exec $DB psql -U postgres -d postgres -tAc "select 1 from pg_roles where rolname='authenticator'" 2>/dev/null | grep -q 1; then
    break
  fi
  echo -n "."; sleep 2
done
sleep 3; echo

LOG=${TMPDIR:-/tmp}/toli-smoke-ripristino.log
: > $LOG
docker cp "$BACKUP/ruoli.sql"  $DB:/tmp/ruoli.sql
docker cp "$BACKUP/schema.sql" $DB:/tmp/schema.sql
docker cp "$BACKUP/dati.sql"   $DB:/tmp/dati.sql
echo "Ripristino del backup (qualche minuto)..."
docker exec $DB psql -U postgres -d postgres -f /tmp/ruoli.sql  >>$LOG 2>&1
docker exec $DB psql -U postgres -d postgres -f /tmp/schema.sql >>$LOG 2>&1
docker exec $DB psql -U postgres -d postgres -c "SET session_replication_role = replica" -f /tmp/dati.sql >>$LOG 2>&1
for f in "${EXTRA[@]}"; do
  echo "Eseguo $(basename $f)"
  docker cp "$f" $DB:/tmp/extra.sql
  docker exec $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/extra.sql >>$LOG 2>&1 || {
    echo "ERRORE in $(basename $f): vedi $LOG"; exit 1; }
done
# Errori attesi nel log: tabelle auth.* e storage.* che l'immagine locale non ha.
ALTRI=$(grep ERROR $LOG | grep -v 'relation "auth\.\|relation "storage\.\|of relation "audit_log_entries"\|of relation "refresh_tokens"\|of relation "users"' | head -5 || true)
[[ -n "$ALTRI" ]] && { echo "Attenzione, errori nel ripristino (log: $LOG):"; echo "$ALTRI"; }

# PostgREST entra come authenticator (password solo di questo container)
docker exec $DB psql -U supabase_admin -d postgres -qc "alter role authenticator with login password '$PWDB'"
# Niente invii veri dal database locale (notifiche push di sql/66, pg_net):
# il riepilogo delle 8 non deve partire da qui.
docker exec $DB psql -U supabase_admin -d postgres -qc "do \$\$ begin if to_regclass('cron.job') is not null then update cron.job set active=false; end if; end \$\$" >>$LOG 2>&1 || true
# auth.uid() come su Supabase e un utente attivo per ognuno dei 9 ruoli
# (quelli mancanti nel backup: "Prova Smoke <ruolo>")
docker cp "$QUI/prepara-locale.sql" $DB:/tmp/prepara-locale.sql
docker exec $DB psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/prepara-locale.sql

docker run -d --name $REST --network $RETE -p 127.0.0.1:$PORTA_REST:3000 \
  -e PGRST_DB_URI="postgres://authenticator:$PWDB@$DB:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$SEGRETO \
  -e PGRST_DB_MAX_ROWS=1000 -e PGRST_DB_POOL=20 $IMG_REST >/dev/null
for i in {1..30}; do
  curl -s -o /dev/null http://127.0.0.1:$PORTA_REST/ && break; sleep 1
done

umask 077
cat > $TEST/.smoke-locale.env <<EOF
SMOKE_BACKEND=locale
SMOKE_REST_URL=http://127.0.0.1:$PORTA_REST
SMOKE_JWT_SECRET=$SEGRETO
SMOKE_DB_CONTAINER=$DB
EOF
echo "Pronto: PostgREST su http://127.0.0.1:$PORTA_REST (impostazioni in test/.smoke-locale.env)"
echo "Ora: cd test && npm run smoke"
