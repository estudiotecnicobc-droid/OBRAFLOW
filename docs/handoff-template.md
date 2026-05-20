# Template de Handoff entre sesiones — Obraflow

Usar al terminar una sesión de Claude Code para preservar contexto en la siguiente.
Copiar y guardar en el issue/ticket/thread de coordinación (GPT, Notion, etc.).

---

## Handoff — [Tanda N] — [Fecha]

### Estado al cierre
[🟢 Completo / 🟡 Parcial — continúa / 🔴 Bloqueado]

### Último commit deployado
```
[hash] [mensaje del commit]
Deploy: obraflowapp-XXXXX-obraflow.vercel.app
Aliases: obraflow.net ✅ / www.obraflow.net ✅
```

### Qué se completó
- [x] [ítem completado 1]
- [x] [ítem completado 2]

### Qué quedó pendiente
- [ ] [ítem pendiente 1] — motivo: [por qué no se hizo]
- [ ] [ítem pendiente 2]

### Migraciones pendientes de ejecutar (acciones del usuario)
- [ ] `NNN_nombre.sql` — [descripción — ya en el repo]

### Bugs conocidos al cierre
| Bug | Severidad | Módulo | Workaround |
|-----|-----------|--------|------------|
| [descripción] | 🔴/🟡/🟢 | [módulo] | [si hay] |

### Archivos clave modificados en esta tanda
```
components/NombreComponente.tsx     — [qué cambió]
services/nombreServicio.ts          — [qué cambió]
supabase/migrations/NNN_*.sql       — [nueva migración]
```

### Contexto técnico para la próxima sesión
[Lo que Claude necesita saber que NO está en el código ni en CLAUDE.md]
[Ej: "La tabla X tiene un trigger que afecta Y", "El hook Z tiene un bug conocido en edge case W"]

### Prompt sugerido para la próxima sesión
```
Continuamos la Tanda N de Obraflow.
Contexto: [resumen en 2 líneas]
Pendiente: [lo que falta]
Archivos relevantes: [lista]
Objetivo de esta sesión: [una oración]
```

---

## Ejemplo completado — Handoff Tanda "Admin Runtime + Global Catalog"

### Estado al cierre
🟢 Completo

### Último commit deployado
```
70c3e62 fix: allow global master materials without organization and clarify admin labels
Deploy: obraflowapp-la3t1mqxn-obraflow.vercel.app
Aliases: obraflow.net ✅ / www.obraflow.net ✅
```

### Qué se completó
- [x] AdminPanel: 3 tabs (Auditoría | Materiales Globales | APUs Globales)
- [x] GlobalMaterialsAdmin: CRUD completo para master_materials org IS NULL
- [x] GlobalTasksAdmin: CRUD básico para master_tasks org IS NULL
- [x] Migración 049: write RLS para master_materials global
- [x] Migración 050: DROP NOT NULL en master_materials.organization_id
- [x] Nav: 'Base de Datos' → 'Administración de Proyecto', 'Admin Sistema' → 'Admin del Sistema'

### Migraciones pendientes de ejecutar
- [ ] `049_global_materials_write.sql`
- [ ] `050_allow_null_organization_id_in_master_materials.sql`

### Contexto técnico para la próxima sesión
- Vercel NO tiene git auto-conectado. Siempre usar `vercel deploy --prod --scope obraflow --yes`.
- `organization_id` en `master_materials` ahora permite NULL. Los hooks de org (`useUnifiedMaterials`, `useMasterMaterials`) filtran por org concreta — no afectados.
- El AdminPanel muestra `systemRole` en el header como diagnóstico runtime. Útil para verificar que la promoción a master_admin fue correcta.
