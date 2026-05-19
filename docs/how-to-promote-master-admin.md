# Cómo promover el primer master_admin

## Prerequisitos

- Migración 048 ejecutada en el Supabase Dashboard del proyecto.
- Acceso al Editor SQL del Supabase Dashboard (solo owners del proyecto Supabase).

## Pasos

### 1. Identificar el UUID del usuario a promover

En el Supabase Dashboard → Authentication → Users, buscar el email del usuario y copiar su UUID.

O via SQL:

```sql
SELECT id, email FROM auth.users WHERE email = 'usuario@email.com';
```

### 2. Ejecutar la promoción

En el SQL Editor del Supabase Dashboard:

```sql
UPDATE public.profiles
SET system_role = 'master_admin'
WHERE id = '<UUID del usuario>';
```

Verificar:

```sql
SELECT id, email, system_role
FROM public.profiles
WHERE system_role = 'master_admin';
```

### 3. Verificar en la app

El usuario debe cerrar sesión y volver a iniciarla para que el nuevo `system_role` se refleje en el JWT y el contexto de React. Luego verá el ítem **"Admin Sistema"** en la barra lateral.

## Reglas de seguridad

- **No existe auto-promoción desde la UI.** Solo un operator con acceso al Supabase Dashboard puede promover usuarios.
- `is_master_admin()` usa `SECURITY DEFINER` con `search_path` fijo, evitando escalada de privilegios vía search_path hijacking.
- El audit log registra automáticamente cada INSERT/UPDATE/DELETE sobre `master_tasks` y `master_materials` via triggers de base de datos.
- Para degradar: reemplazar `'master_admin'` por `'tester'` o `'user'` en el mismo UPDATE.

## Promover un tester (acceso de solo lectura)

```sql
UPDATE public.profiles
SET system_role = 'tester'
WHERE id = '<UUID del usuario>';
```

Los testers pueden usar la app normalmente pero no tienen acceso al área de administración del sistema ni pueden escribir el catálogo global.
