# Template de Tanda — Obraflow

Copiar, completar y pasar como input a `/01-product-coordinator`.

---

## Tanda N — [Nombre corto]

**Fecha:** YYYY-MM-DD
**Módulo:** [nombre del módulo principal afectado]
**Disparador:** [por qué se abre esta tanda]

### Objetivo
[Una oración. Qué debe ser verdad al terminar que no lo era antes.]

### Cambios esperados
- [ ] [cambio 1]
- [ ] [cambio 2]

### Migraciones necesarias (estimado)
- [ ] `NNN_nombre.sql` — [descripción corta]

### Módulos a NO tocar
- [módulo 1] — [motivo]

### Criterios de cierre
- [ ] [criterio verificable 1]
- [ ] [criterio verificable 2]

### Acciones manuales del usuario
- [ ] Ejecutar migración `NNN_*.sql` en Supabase
- [ ] Verificar en `obraflow.net` que [X] funcione

---

## Ejemplo completado — Tanda "Presupuesto / Agregar tarea"

**Fecha:** 2026-05-20
**Módulo:** BudgetEditor + BudgetGrid
**Disparador:** Los usuarios no pueden agregar una tarea al presupuesto desde el modal de selección de APU sin que se pierda el contexto del rubro activo.

### Objetivo
Al seleccionar un APU en el modal de BudgetEditor, el ítem se agrega al rubro activo sin resetear la selección de rubro.

### Cambios esperados
- [ ] Fix en `BudgetEditor.tsx`: preservar `selectedRubroId` al cerrar el modal APU
- [ ] Agregar feedback visual (toast o badge) confirmando que el ítem fue agregado

### Migraciones necesarias
- Ninguna (bug de UI puro)

### Módulos a NO tocar
- `ERPContext.tsx` — requiere discusión previa
- `BudgetGrid.tsx` — no está en scope

### Criterios de cierre
- [ ] Seleccionar APU en modal → ítem aparece en el rubro activo
- [ ] El rubro no se resetea al cerrar el modal
- [ ] El toast "Tarea agregada" aparece por 2 segundos
- [ ] Ningún cambio en Planning o Dashboard

### Acciones manuales del usuario
- [ ] Verificar en `obraflow.net` con cuenta real de admin
- [ ] Probar con 0 ítems en rubro, con 5 ítems, y cambiando de rubro entre adiciones
