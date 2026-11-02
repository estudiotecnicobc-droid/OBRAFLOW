#!/usr/bin/env bash
# Aplica las migraciones del motor de precios (20261102100001..10) sobre una base descartable
# con el esquema de producción (snapshot del harness RLS) y stubs de pgmq / pg_cron / pg_net / storage.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres PGPASSWORD=... supabase/tests/precios/run.sh
#      (sin servidor: PRECIOS_LOCAL_PG=1 supabase/tests/precios/run.sh levanta un cluster en /tmp/pg_precios, puerto 5433)
set -euo pipefail
cd "$(dirname "$0")"
DB="${PRECIOS_TEST_DB:-obraflow_precios_test}"
MIG_DIR="../../migrations"

if [[ "${PRECIOS_LOCAL_PG:-0}" == "1" ]]; then
  PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
  PGDATA_DIR="${PGDATA_DIR:-/tmp/pg_precios}"
  export PGHOST=localhost PGPORT="${PGPORT:-5433}" PGUSER=postgres
  # initdb/postgres no corren como root: si somos root, delegamos al usuario de sistema "postgres".
  AS_PG=()
  if [[ "$(id -u)" == "0" ]]; then
    mkdir -p "$PGDATA_DIR" && chown postgres "$PGDATA_DIR"
    AS_PG=(runuser -u postgres --)
  fi
  if [[ ! -s "$PGDATA_DIR/PG_VERSION" ]]; then
    "${AS_PG[@]}" "$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres -A trust >/dev/null
  fi
  if ! "${AS_PG[@]}" "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
    "${AS_PG[@]}" "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -o "-p $PGPORT -k /tmp" -l "$PGDATA_DIR/server.log" -w start >/dev/null
  fi
  export PATH="$PGBIN:$PATH"
fi

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"

for f in ../rls/00_stubs.sql ../rls/01_schema_snapshot.sql 00b_stubs_precios.sql; do
  echo "== $f"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

# Prerrequisito de 20261102100009 que el snapshot RLS no incluye (sí está en producción):
# calculate_consolidated_resources(jsonb,text,date), definición final de la 057.
for f in "$MIG_DIR"/057_fix_resources_commercial_columns.sql; do
  echo "== $(basename "$f") (prerrequisito)"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

for f in "$MIG_DIR"/202611021000{01,02,03,04,05,06,07,08,09,10}_*.sql \
         "$MIG_DIR"/20261103100000_*.sql; do
  echo "== $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

echo "== verificación de objetos"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f 02_verificacion.sql
echo "== prueba de humo"
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -f 03_humo.sql >/dev/null
echo "== motor (observaciones, mediana, AS_OF, congelado)"
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -f 04_motor.sql >/dev/null
echo "== aprobación trazable (H1/H2, historial)"
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -f 04b_aprobacion_trazable.sql >/dev/null
echo "== QA: circuito completo (CSV → aprobación → publicación → mediana → congelado → RLS)"
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -f 05_circuito.sql >/dev/null
echo "== QA: approve_supplier_mapping (idempotencia, aprobador original, conflictos)"
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -f 06_aprobacion_reintentos.sql >/dev/null
echo "== QA: approve_supplier_mapping concurrente (dos sesiones psql en paralelo)"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f 06b_concurrencia_setup.sql
CONC_OUT="$(mktemp -d)"
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -v uid=0c000000-0000-0000-0000-00000000aaaa -f 06c_concurrencia_approve.sql >"$CONC_OUT/1.log" 2>&1 &
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -v uid=0c000000-0000-0000-0000-00000000aaa2 -f 06c_concurrencia_approve.sql >"$CONC_OUT/2.log" 2>&1 &
wait
if grep -qiE "ERROR|duplicate key|unique" "$CONC_OUT"/*.log; then
  echo "concurrencia: una sesión falló"; cat "$CONC_OUT"/*.log; exit 1
fi
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f 06d_concurrencia_check.sql
echo "== QA: auditoría de políticas RLS (columnas sin calificar en EXISTS)"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f 07_politicas_calificacion.sql
echo "OK: migraciones de precios aplicadas y QA en verde en $DB"
