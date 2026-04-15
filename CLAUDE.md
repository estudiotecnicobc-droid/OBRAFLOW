# CLAUDE.md — Instrucciones del Proyecto

Este archivo define el contexto, convenciones y restricciones que Claude debe respetar al trabajar en este repositorio.

---

## Stack

- React 19 + TypeScript 5.8 + Vite 6
- Tailwind CSS (clases inline, sin archivo CSS separado)
- lucide-react para íconos
- Supabase (`@supabase/supabase-js ^2.98`) — backend principal
- localStorage via `usePersistentState` para datos todavía no migrados

## Estructura de carpetas clave

```
src/
  App.tsx                     # Routing y estados principales (loading / auth / project)
  context/
    AuthContext.tsx            # Auth Supabase + membresías + org activa
    ERPContext.tsx             # Estado global del proyecto activo (NO tocar sin discutir)
  components/                 # Un archivo por componente, PascalCase
  services/                   # Acceso a Supabase y lógica de datos
  hooks/                      # Custom hooks reutilizables
  types.ts                    # Todas las interfaces y tipos del dominio
  constants.ts                # Seeds iniciales por organización
```

## Multitenancy

- Cada organización es un tenant independiente
- `activeOrganizationId` (UUID Supabase) es el tenant ID en runtime
- `user.organizationId` (alias de `activeOrganizationId`) es lo que consume ERPContext
- Los datos del proyecto se filtran siempre por `organizationId`
- Nunca hardcodear org IDs

## Supabase

- Cliente singleton: `services/supabaseClient.ts`
- Lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de `.env.local`
- RPCs con lógica sensible usan `SECURITY DEFINER` (bootstrap, accept_invitation, get_invitation_by_token)
- RLS activa en todas las tablas del dominio
- snake_case en DB, camelCase en TypeScript — los servicios hacen la conversión

## Módulos migrados a Supabase (o en proceso)

| Módulo | Tabla(s) | Servicio |
|--------|----------|---------|
| Auth / Orgs | `profiles`, `organizations`, `organization_members` | `authSupabaseService.ts` |
| Proyectos | `projects` | `projectsService.ts` |
| Tareas + yields | `tasks`, `task_yields`, `task_labor_yields`, `task_tool_yields` | `tasksService.ts` |
| Ítems de presupuesto | `budget_items` | `budgetItemsService.ts` |
| Materiales, Herramientas, Categorías MO | `materials`, `tools`, `labor_categories` | servicios propios |
| Base maestra materiales | `master_materials` | `masterMaterialsService.ts` |
| Base maestra tareas / APU | `master_tasks` + sub-tablas | `masterTasksSupabaseService.ts` |
| Plantillas presupuesto | `budget_templates`, `budget_template_items` | `budgetTemplatesSupabaseService.ts` |
| Invitaciones | `invitations` | `invitationsService.ts` |

## Módulos todavía sensibles / a revisar

- `Crew`, `taskCrewYields`
- Planning, Dashboard, ManagementPanel
- Snapshots, Receptions, Subcontractors, Contracts, Certifications, Docs, Quality, Rubros, Calendar presets

## Convenciones de código

- No tocar `ERPContext.tsx` sin discutir el cambio primero
- Nuevos servicios Supabase: siempre mapear snake_case → camelCase en el servicio, nunca en el componente
- Optimistic update: actualizar estado local primero, luego sincronizar con Supabase (fire-and-forget para operaciones no críticas)
- Estrategia update para tablas con hijos (ej. master_tasks): UPDATE padre + DELETE hijos + INSERT hijos nuevos
- `crypto.randomUUID()` para IDs de entidades nuevas en localStorage
- Soft delete vía `is_active = false` en tablas maestras

## Roles y permisos

```
OrgRole (DB)     →  Role (app)
owner / admin    →  'admin'
editor           →  'project_manager'
viewer           →  'client'
(sin membresía)  →  'worker'
```

- `canManage = user?.role === 'admin'` para operaciones de gestión
- Los guards de UI duplican la lógica de RLS — nunca confiar solo en uno

## Convención de trabajo

Cada cambio importante debe tener:
- spec en `/docs/specs/`
- migración SQL en `/supabase/migrations/`
- prompt de referencia en `/prompts/`
- checklist QA en `/docs/qa/`

## Reglas de producto

### Base de Datos de empresa
Organizada en: Recursos | Mano de Obra | APU | Plantillas | Sistema

### Proyecto
Consume: recursos de empresa + APU de empresa + presupuesto propio + planificación propia

## Qué NO hacer

- No crear archivos `.md` de documentación salvo que se pida explícitamente
- No agregar features no solicitadas ni refactorizar código que funciona
- No commitear cambios salvo indicación explícita
- No usar `grep`/`find`/`cat` de bash cuando existen herramientas dedicadas (Grep, Glob, Read)
- No agregar comentarios ni docstrings al código que no se modificó
- No implementar manejo de errores para casos que no pueden ocurrir
