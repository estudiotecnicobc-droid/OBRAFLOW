# Reglas de trabajo — Obraflow

## Git

- Nunca trabajar directamente sobre main.
- Toda tarea debe usar una rama específica.
- Nunca mergear automáticamente.
- Nunca pushear a main.
- Nunca desplegar automáticamente.
- Antes de modificar archivos, ejecutar git status --short.
- No mezclar documentación, seguridad, tests y producto en un mismo commit.
- Cada commit debe ser pequeño y tener un único propósito.
- Al finalizar, informar rama, commit, archivos y validaciones.

## Seguridad

- Nunca imprimir ni versionar claves, tokens, contraseñas o archivos .env.
- Nunca usar service_role en frontend.
- Nunca confiar en organization_id enviado desde frontend.
- Toda tabla multiempresa nueva debe tener organization_id y RLS.
- Toda tabla hija debe tener RLS.
- Toda RPC SECURITY DEFINER debe:
  - fijar search_path;
  - validar auth.uid();
  - resolver la organización desde los datos;
  - validar membresía y rol.
- No ejecutar SQL destructivo.
- No ejecutar migraciones productivas sin autorización explícita.

## Operaciones críticas

Las operaciones de:

- enviar;
- aprobar;
- convertir;
- importar;
- eliminar;
- modificar permisos;

deben esperar la respuesta de la base de datos y mostrar errores visibles.

No usar fire-and-forget ni catch(console.error) para operaciones críticas.

## Flujo de trabajo

1. Auditar.
2. Presentar evidencia.
3. Proponer plan.
4. Esperar aprobación humana.
5. Implementar en rama.
6. Ejecutar typecheck, tests y build.
7. Revisar diff.
8. Abrir PR.
9. Esperar revisión humana.
10. Merge y deploy únicamente con autorización.

## Alcance actual

Prioridades:

1. Cerrar vulnerabilidades RPC cross-tenant.
2. Resolver errores TypeScript.
3. Agregar gate de CI.
4. Mejorar higiene del repositorio.
5. Recién después implementar Cotización → Proyecto.

## Prohibiciones actuales

- No implementar billing.
- No implementar portal cliente.
- No implementar adjuntos.
- No implementar Gantt avanzado.
- No crear schema de cotizaciones hasta cerrar seguridad y calidad.
