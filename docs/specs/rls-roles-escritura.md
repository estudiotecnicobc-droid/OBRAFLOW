# Permisos de escritura por rol (073)

## Problema (producción 31/10/2026)
- Las políticas de INSERT/UPDATE/DELETE de 14 tablas de trabajo (projects, tasks, budget_items, budget_templates, budget_template_items, master_tasks y sus 3 tablas hijas, task_yields, task_labor_yields, task_tool_yields, task_crew_yields) y el UPDATE de organizations pedían solo **membresía**: un `viewer` (en la app, "cliente") podía crear, modificar y borrar llamando a la API. Había además políticas legacy duplicadas con la misma laxitud (se combinan con OR).
- `invitations.role` no tenía restricción: un admin podía invitar con rol `owner` y crear un dueño nuevo, cuando `org_members_update_role` lo prohíbe.
- Hoy no hay miembros viewer: no hay exposición real, pero aparecería al invitar al primer cliente.

## Cambio (migración 073, pendiente de OK)
- Escritura en esas tablas: `is_org_member_with_role(org, owner/admin/editor)`. Se eliminan las políticas legacy duplicadas.
- `organizations` UPDATE: solo owner/admin.
- `invitations`: `CHECK (role in ('admin','editor','viewer'))` y `accept_invitation` rechaza otros roles y sesiones sin usuario.
- Lectura sin cambios.

## Tests
`supabase/tests/rls/03_roles.sql` (CI): viewer no escribe, editor sí (control), admin no puede invitar ni ascender a owner. Hoy: 53/94 con 41 fugas conocidas. Con 073 aplicada en la copia: 94/94 y aislamiento 210/210.

## Decisión pendiente
Con la 073, un cliente (viewer) no puede registrar avance en "Avance y control". Si se quiere que los clientes registren avance, hay que definir qué columnas y agregar una política específica.
