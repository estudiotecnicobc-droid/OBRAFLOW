# Cómo promover el primer master_admin

## Prerequisitos

- Migración `048_master_admin_audit.sql` ejecutada en el Supabase Dashboard del proyecto.
- Acceso al Editor SQL del Supabase Dashboard (solo owners del proyecto Supabase).

---

## Promover arqgonzaloblanco@gmail.com (master_admin designado)

Ejecutar en el SQL Editor del Supabase Dashboard:

```sql
-- Promover a master_admin
UPDATE public.profiles
SET system_role = 'master_admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'arqgonzaloblanco@gmail.com'
);
```

Verificar:

```sql
SELECT p.id, u.email, p.system_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'arqgonzaloblanco@gmail.com';
```

Resultado esperado:
```
id      | email                          | system_role
--------|--------------------------------|-------------
<uuid>  | arqgonzaloblanco@gmail.com     | master_admin
```

---

## Verificar que sea el único master_admin (opcional)

```sql
SELECT p.id, u.email, p.system_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.system_role = 'master_admin';
```

---

## Después de la promoción

El usuario debe **cerrar sesión y volver a iniciarla** para que el nuevo `system_role` se cargue en el contexto de React. Una vez conectado, verá el ítem **"Admin Sistema"** en la barra lateral de navegación (solo visible para master_admin).

---

## Promover un tester (acceso de solo lectura al catálogo)

```sql
UPDATE public.profiles
SET system_role = 'tester'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'email@empresa.com'
);
```

Los usuarios con rol `tester` pueden usar la app normalmente pero no tienen acceso al área de administración del sistema ni pueden escribir en el catálogo global.

---

## Degradar un master_admin

```sql
UPDATE public.profiles
SET system_role = 'user'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'email@empresa.com'
);
```

---

## Reglas de seguridad

- **No existe auto-promoción desde la UI.** Solo un operator con acceso al Supabase Dashboard puede promover usuarios. Esta es una restricción intencional.
- `is_master_admin()` usa `SECURITY DEFINER` con `search_path` fijo, evitando privilege escalation vía search_path hijacking.
- El frontend NO toma decisiones de acceso basándose en emails hardcodeados. El rol viene siempre de `profiles.system_role`.
- El audit log registra automáticamente cada INSERT/UPDATE/DELETE sobre `master_tasks` y `master_materials` via triggers de base de datos (migration 048).
