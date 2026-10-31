# Fichas técnicas de tareas en la base maestra

## Objetivo
Cada APU frecuente del catálogo general muestra una ficha técnica: esquema propio, descripción, datos técnicos, notas de ejecución, fuente y tareas que comparten la misma ficha.

## Fuente
`scripts/fichas/`: 44 fichas por gremio (esquemas SVG dibujados para ObraFlow; los de construcción en seco con datos del Manual Técnico Durlock). `python3 scripts/fichas/build_migration.py` genera `supabase/migrations/066_fichas_tecnicas_apu.sql`. No editar la migración a mano.

## Datos (migración 066, idempotente)
- `master_tasks.technical_sheet jsonb` (nullable).
- La ficha se carga en 71 APU del catálogo general (`organization_id IS NULL`). Una ficha puede cubrir varios APU (p. ej. revoque grueso + fino interior); cada uno lista los demás en `relacionadas`.
- Los consumos y la mano de obra no van en la ficha: salen del APU.
- APU nuevos, solo donde no había equivalente, con la aclaración de en qué se distinguen de los parecidos:
  - OF-FUN-104 Zapata corrida de hormigón armado (≠ OF-FUN-002 ciclópeo, ≠ OF-FUN-004 viga de fundación).
  - OF-YES-104 Jaharro y enlucido de yeso sobre mampostería.
  - OF-IMP-003 Impermeabilización cementicia de piso de baño (≠ OF-IMP-001 balcones, ≠ OF-CAR-103 carpeta hidrófuga).
  - OF-SAN-128 Boca de agua fría y caliente (alternativa por boca a OF-SAN-001/002 por ml; usar una u otra).
- Insumo nuevo OF-M-ICB (impermeabilizante cementicio bicomponente, precio estimado a verificar).
- No toca APU de empresas: las copias toman la ficha del catálogo general por código.

## Interfaz
- `services/technicalSheetService.ts`: lee la ficha del APU; si no tiene, la del catálogo general con el mismo código. Sin la migración aplicada devuelve `null`.
- `TechnicalSheetSection` dentro de `APUTechnicalReportDrawer` (botón "Ver ficha técnica" de la base de tareas). El esquema se muestra con `<img>` (data URI), así que no ejecuta contenido aunque una empresa edite su copia.
