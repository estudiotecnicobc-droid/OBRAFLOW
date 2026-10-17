# Flujo oficial de trabajo con IA — Obraflow
**Actualizado:** 2026-05-26

---

## Esquema de agentes

| Agente | Herramienta | Responsabilidad principal |
|--------|-------------|--------------------------|
| Coordinador | **ChatGPT** | Prioriza roadmap, consolida contexto, redacta prompts finales, toma decisiones de producto |
| Implementador | **Claude Code** | Escribe código, migraciones, hace build/lint/deploy, gestiona agentes paralelos |
| Validador UX | **Gemini Pro** | UX, naming, onboarding, microcopy, beta-readiness, flujos de usuario |
| Arquitecto DB | **DeepSeek** | SQL, RLS, lógica de costos, contratos de datos, riesgos de deuda técnica |

---

## Responsabilidades por agente

### ChatGPT — Coordinador y Decisiones de Producto
- Priorizar el roadmap y definir tandas
- Redactar el prompt final que se le pasa a Claude Code
- Tomar decisiones cuando hay trade-offs de producto (scope, UX vs técnico)
- Consolidar contexto entre sesiones (leer HANDOFF_CURRENT.md)
- Revisar criterios de aceptación antes de cerrar una tanda
- QA de lógica de negocio: "¿tiene sentido que funcione así para el usuario?"

### Gemini Pro — UX, Naming y Microcopy
- Revisar flows completos de UI desde la perspectiva del usuario
- Proponer naming claro para módulos, botones, estados
- Escribir microcopy: tooltips, mensajes vacíos, confirmaciones, errores
- Evaluar onboarding: ¿un arquitecto que llega por primera vez entiende qué hacer?
- Beta-readiness review: ¿está listo para mostrarle a colegas?
- Sugerir mejoras de información architecture sin tocar código

### DeepSeek — Base de Datos y Lógica de Costos
- Revisar migraciones SQL antes de ejecutarlas en producción
- Verificar que RLS no tiene huecos de seguridad
- Analizar contratos de datos: ¿qué pasa si un campo es NULL?
- Revisar fórmulas de cálculo de costos (APUs, conversiones, explosión de insumos)
- Detectar deuda técnica en el schema
- Proponer índices o refactors de queries cuando hay problemas de performance

### Claude Code — Implementación y Deploy
- Leer archivos del repo antes de tocar cualquier cosa
- Implementar cambios mínimos según el scope de la tanda
- `npm run build` antes de cada commit
- Commit con mensaje claro (tipo: fix/feat/docs + descripción)
- Push a github + deploy manual a Vercel + alias de dominio
- Usar agentes paralelos (Explore, Plan, general-purpose) para tareas complejas
- NO tocar ERPContext.tsx sin discutir
- NO romper módulos estables al arreglar otro

---

## Flujo por tanda

```
1. ENTRADA DEL PROBLEMA
   → ChatGPT o el usuario describe el objetivo
   → ChatGPT consolida contexto leyendo HANDOFF_CURRENT.md
   → ChatGPT define criterios de cierre y redacta prompt para Claude Code

2. VALIDACIÓN DE SCHEMA (solo si hay cambios de DB)
   → DeepSeek revisa la migración propuesta
     - Detecta NOT NULL sin default, RLS faltante, contratos débiles
     - Recomienda hotfix vs fix sostenible
     - Confirma que la migración es idempotente

3. IMPLEMENTACIÓN
   → Claude Code recibe el prompt de ChatGPT
   → Lee los archivos relevantes
   → Implementa el cambio mínimo necesario
   → npm run build
   → Commit claro

4. ACCIÓN MANUAL DEL USUARIO (si aplica)
   → Ejecutar migraciones en Supabase Dashboard > SQL Editor
   → Configurar variables de entorno en Vercel
   → Verificar Supabase Auth redirect URLs si aplica

5. QA FUNCIONAL
   → Gemini revisa UX, copy y flujos
   → Claude Code puede ejecutar QA del bundle (grep de strings en dist/)
   → Usuario verifica casos críticos del módulo afectado

6. RELEASE
   → git push github main
   → vercel deploy --prod --scope obraflow --yes
   → vercel alias set <url> obraflow.net --scope obraflow
   → vercel alias set <url> www.obraflow.net --scope obraflow
   → Confirmar aliases con vercel alias ls --scope obraflow
```

---

## Reglas invariantes

### Código
- No romper módulos estables sin aprobación explícita.
- No refactorizar código que funciona salvo que sea parte del scope.
- No agregar features fuera del scope de la tanda.
- Un archivo por componente, PascalCase en `components/`.
- Sin comentarios explicativos — solo WHY si es no obvio.
- No agregar handling de errores para casos imposibles.

### Base de datos
- Todo cambio de schema va en `/supabase/migrations/NNN_nombre.sql`.
- Las migraciones deben ser idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Claude NO ejecuta SQL directamente — solo lo escribe; el usuario lo ejecuta.
- Soft delete via `is_active = false`. Nunca `DELETE` físico en tablas maestras.
- `organization_id` es el identificador de tenant en todas las tablas del dominio.
- El catálogo global usa `organization_id IS NULL`.

### Deploy
- El proyecto Vercel **no tiene git auto-conectado**. Todo deploy es manual.
- Comando: `NODE_TLS_REJECT_UNAUTHORIZED=0 vercel deploy --prod --scope obraflow --yes`
- Después de cada deploy, actualizar alias `obraflow.net` y `www.obraflow.net`.
- No deployar si solo cambian archivos de documentación.

### Tandas
- Una tanda = un objetivo.
- Las tandas son chicas. Mejor 3 tandas de 1 feature que 1 tanda de 3 features.
- No abrir features nuevas fuera del orden acordado.
- Siempre terminar con build limpio y deploy verificado.

---

## Stack de referencia rápida

```
Frontend:     React 19 + TypeScript 5.8 + Vite 6
Styling:      Tailwind CSS (clases inline)
Icons:        lucide-react
Backend:      Supabase (@supabase/supabase-js ^2.98)
Auth:         Supabase Auth (JWT + magic link + recovery)
Multitenancy: organization_id UUID en toda entidad, RLS via is_org_member_with_role()
Global:       organization_id IS NULL, acceso via is_master_admin()
Excel:        xlsx-js-style v1.2.0
Deploy:       Vercel (manual, scope: obraflow), dominio obraflow.net
Repo:         github → arqgonzaloblanco-cmd/obraflowapp
```

---

## Comandos clave

```bash
# Build
npm run build

# Deploy
NODE_TLS_REJECT_UNAUTHORIZED=0 vercel deploy --prod --scope obraflow --yes
NODE_TLS_REJECT_UNAUTHORIZED=0 vercel alias set <url> obraflow.net --scope obraflow
NODE_TLS_REJECT_UNAUTHORIZED=0 vercel alias set <url> www.obraflow.net --scope obraflow

# Verificar aliases
NODE_TLS_REJECT_UNAUTHORIZED=0 vercel alias ls --scope obraflow | grep obraflow.net

# Slash commands Claude Code (en .claude/commands/)
/01-product-coordinator
/02-db-architect-reviewer
/03-feature-builder
/04-qa-functional-reviewer
/05-release-manager
```

---

## Slash commands disponibles

| Comando | Propósito |
|---------|-----------|
| `/01-product-coordinator` | Resume contexto, define criterios de cierre, lista acciones del usuario |
| `/02-db-architect-reviewer` | Revisa migración propuesta, detecta riesgos de schema |
| `/03-feature-builder` | Implementa la tanda, hace build y commit |
| `/04-qa-functional-reviewer` | Checklist de flows de usuario, copy, beta-readiness |
| `/05-release-manager` | Push + deploy + alias + confirmación |
