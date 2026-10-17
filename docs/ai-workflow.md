# Flujo oficial de trabajo con IA — Obraflow

## Esquema de agentes

| Agente | Herramienta | Responsabilidad |
|--------|-------------|-----------------|
| Coordinador | GPT | Prioriza, consolida contexto, redacta prompts finales |
| Implementador | **Claude Code** | Escribe código, migraciones, hace build/lint/deploy |
| Validador UX/QA | Gemini | Revisa flujos de UI, microcopy, beta-readiness |
| Arquitecto DB | DeepSeek | Revisa contratos de datos, RLS, deuda técnica |

Los agentes de Claude Code son slash-commands en `.claude/commands/`. Se invocan dentro de una sesión de Claude Code con `/nombre-agente`.

---

## Flujo por tanda

```
1. ENTRADA DEL PROBLEMA
   → GPT o el usuario describe el objetivo
   → /01-product-coordinator  [Claude Code]
     - Resume contexto
     - Define criterios de cierre
     - Lista acciones manuales del usuario

2. VALIDACIÓN DE SCHEMA (si hay cambios de DB)
   → DeepSeek / /02-db-architect-reviewer  [en paralelo si aplica]
     - Revisa migración propuesta
     - Detecta NOT NULL, RLS faltante, contratos débiles
     - Recomienda hotfix vs fix sostenible

3. IMPLEMENTACIÓN
   → /03-feature-builder  [Claude Code]
     - Lee archivos relevantes
     - Implementa el cambio
     - npm run lint && npm run typecheck && npm run build
     - Commit claro

4. ACCIÓN MANUAL DEL USUARIO
   → Ejecutar migraciones en Supabase Dashboard > SQL Editor
   → Configurar variables de entorno si aplica
   → Verificar Supabase Auth redirect URLs si aplica

5. QA FUNCIONAL
   → Gemini / /04-qa-functional-reviewer  [Claude Code]
     - Checklist de flows de usuario
     - Revisión de copy y naming
     - Evaluación de beta-readiness

6. RELEASE
   → /05-release-manager  [Claude Code]
     - git push github main
     - vercel deploy --prod --scope obraflow --yes
     - vercel alias set [...] obraflow.net --scope obraflow
     - Confirma qué quedó en producción
```

---

## Reglas invariantes

### Código
- No romper módulos estables sin aprobación explícita.
- No refactorizar código que funciona salvo que sea necesario para el cambio pedido.
- No agregar features fuera del scope de la tanda.
- Un archivo por componente, PascalCase en `components/`.
- Sin comentarios explicativos — solo WHY si es no obvio.

### Base de datos
- Todo cambio de schema va en `/supabase/migrations/NNN_nombre.sql`.
- Las migraciones deben ser idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Claude NO ejecuta SQL directamente — solo lo escribe; el usuario lo ejecuta.
- Soft delete via `is_active = false`. Nunca `DELETE` físico en tablas maestras.
- `organization_id` es el identificador de tenant en todas las tablas del dominio.

### Deploy
- El proyecto Vercel **no tiene git auto-conectado**. Todo deploy es manual.
- Comando: `vercel deploy --prod --scope obraflow --yes`
- Después de cada deploy, actualizar alias `obraflow.net` y `www.obraflow.net`.

### Tandas
- Una tanda = un objetivo.
- Las tandas son chicas. Mejor 3 tandas de 1 feature que 1 tanda de 3 features.
- No abrir features nuevas fuera del orden acordado en el roadmap.

---

## Stack de referencia rápida

```
Frontend:   React 19 + TypeScript 5.8 + Vite 6
Styling:    Tailwind CSS (clases inline)
Icons:      lucide-react
Backend:    Supabase (@supabase/supabase-js ^2.98)
Auth:       Supabase Auth (JWT)
Multi-tenant: organization_id UUID en toda entidad, RLS via is_org_member_with_role()
Global catalog: organization_id IS NULL, acceso via is_master_admin()
Deploy:     Vercel (manual), dominio obraflow.net
Repo:       github → arqgonzaloblanco-cmd/obraflowapp
```
