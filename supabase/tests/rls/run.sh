#!/usr/bin/env bash
# Corre los tests de aislamiento RLS en una base descartable.
# Uso: PGHOST=... PGUSER=postgres PGPASSWORD=... supabase/tests/rls/run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB="${RLS_TEST_DB:-obraflow_rls_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
for f in 00_stubs.sql 01_schema_snapshot.sql ${RLS_EXTRA_SQL:-} 02_aislamiento.sql 03_roles.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
