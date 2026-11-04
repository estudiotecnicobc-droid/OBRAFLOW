-- =============================================================================
-- Migration 007: RLS completo para todas las tablas del sistema
-- =============================================================================
-- Estrategia central:
--   La función auxiliar is_org_member() verifica que auth.uid() tenga una fila
--   activa en organization_members para el org dado.
--   Se define con SECURITY DEFINER + search_path fijo para evitar privilege
--   escalation vía search_path hijacking.
-- =============================================================================

-- ─── Función auxiliar de membresía ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_org_member(org_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id        = auth.uid()
      AND organization_id = org_uuid
  );
$$;

-- Versión con rol mínimo requerido (para operaciones de escritura sensibles)
CREATE OR REPLACE FUNCTION public.is_org_member_with_role(org_uuid uuid, min_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id         = auth.uid()
      AND organization_id  = org_uuid
      AND role             = ANY(min_roles)
  );
$$;

-- Sobrecargas TEXT: para tablas con organization_id TEXT (legacy).
-- PostgreSQL rutea automáticamente según el tipo del argumento.
CREATE OR REPLACE FUNCTION public.is_org_member(org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id             = auth.uid()
      AND organization_id::text = org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member_with_role(org_id text, min_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id             = auth.uid()
      AND organization_id::text = org_id
      AND role                = ANY(min_roles)
  );
$$;


-- =============================================================================
-- 1. organizations
--    Cualquier miembro puede ver su organización.
--    Solo owner/admin pueden modificarla.
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;

CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT TO authenticated
  USING ( is_org_member(id) );

CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(id, ARRAY['owner','admin']) )
  WITH CHECK ( is_org_member_with_role(id, ARRAY['owner','admin']) );


-- =============================================================================
-- 2. profiles
--    Cada usuario ve y edita solo su propio perfil.
--    Miembros de la misma org pueden ver nombres (para la pantalla de usuarios).
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_org"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;

-- Propio perfil siempre visible
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING ( id = auth.uid() );

-- Perfiles de compañeros de org visibles (para UsersPanel)
CREATE POLICY "profiles_select_org" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om1
      JOIN public.organization_members om2
        ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid()
        AND om2.user_id = profiles.id
    )
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING  ( id = auth.uid() )
  WITH CHECK ( id = auth.uid() );


-- =============================================================================
-- 3. organization_members
--    Miembros ven la lista de su org.
--    Solo owner/admin pueden insertar (invitaciones) o cambiar roles.
--    La RPC accept_invitation es SECURITY DEFINER y puede insertar directamente.
-- =============================================================================

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select"      ON public.organization_members;
DROP POLICY IF EXISTS "org_members_insert"      ON public.organization_members;
DROP POLICY IF EXISTS "org_members_update_role" ON public.organization_members;
DROP POLICY IF EXISTS "org_members_delete"      ON public.organization_members;

CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin']) );

-- No se puede cambiar el rol de un owner ni auto-promover
CREATE POLICY "org_members_update_role" ON public.organization_members
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin']) )
  WITH CHECK (
    is_org_member_with_role(organization_id, ARRAY['owner','admin'])
    -- No se puede degradar al owner
    AND (role <> 'owner' OR user_id = auth.uid())
  );

CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    is_org_member_with_role(organization_id, ARRAY['owner','admin'])
    -- No puede eliminarse a sí mismo si es owner
    AND NOT (user_id = auth.uid() AND role = 'owner')
  );


-- =============================================================================
-- 4. invitations
--    Solo miembros owner/admin de la org pueden gestionar invitaciones.
--    La función get_invitation_by_token() es SECURITY DEFINER para aceptación pública.
-- =============================================================================

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
DROP POLICY IF EXISTS "invitations_insert" ON public.invitations;
DROP POLICY IF EXISTS "invitations_delete" ON public.invitations;

CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin']) );

CREATE POLICY "invitations_delete" ON public.invitations
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin']) );


-- =============================================================================
-- 5. projects
--    Todo miembro puede leer proyectos de su org.
--    owner/admin/editor pueden crear y modificar.
-- =============================================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_update" ON public.projects;
DROP POLICY IF EXISTS "projects_delete" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin']) );


-- =============================================================================
-- 6. tasks
--    Mismo patrón que projects — scoped por organization_id.
-- =============================================================================

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );


-- =============================================================================
-- 7. task_yields / task_labor_yields / task_tool_yields
--    Scoped por organization_id en cada fila (heredado de la tarea).
-- =============================================================================

ALTER TABLE public.task_yields       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_labor_yields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tool_yields  ENABLE ROW LEVEL SECURITY;

-- task_yields
DROP POLICY IF EXISTS "task_yields_select" ON public.task_yields;
DROP POLICY IF EXISTS "task_yields_insert" ON public.task_yields;
DROP POLICY IF EXISTS "task_yields_update" ON public.task_yields;
DROP POLICY IF EXISTS "task_yields_delete" ON public.task_yields;

CREATE POLICY "task_yields_select" ON public.task_yields
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "task_yields_insert" ON public.task_yields
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "task_yields_update" ON public.task_yields
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "task_yields_delete" ON public.task_yields
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

-- task_labor_yields
DROP POLICY IF EXISTS "task_labor_yields_select" ON public.task_labor_yields;
DROP POLICY IF EXISTS "task_labor_yields_insert" ON public.task_labor_yields;
DROP POLICY IF EXISTS "task_labor_yields_update" ON public.task_labor_yields;
DROP POLICY IF EXISTS "task_labor_yields_delete" ON public.task_labor_yields;

CREATE POLICY "task_labor_yields_select" ON public.task_labor_yields
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "task_labor_yields_insert" ON public.task_labor_yields
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "task_labor_yields_update" ON public.task_labor_yields
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "task_labor_yields_delete" ON public.task_labor_yields
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

-- task_tool_yields
DROP POLICY IF EXISTS "task_tool_yields_select" ON public.task_tool_yields;
DROP POLICY IF EXISTS "task_tool_yields_insert" ON public.task_tool_yields;
DROP POLICY IF EXISTS "task_tool_yields_update" ON public.task_tool_yields;
DROP POLICY IF EXISTS "task_tool_yields_delete" ON public.task_tool_yields;

CREATE POLICY "task_tool_yields_select" ON public.task_tool_yields
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "task_tool_yields_insert" ON public.task_tool_yields
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "task_tool_yields_update" ON public.task_tool_yields
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "task_tool_yields_delete" ON public.task_tool_yields
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );


-- =============================================================================
-- 8. budget_items
--    Scoped por organization_id. Viewer solo puede leer.
-- =============================================================================

ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_items_select" ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_insert" ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_update" ON public.budget_items;
DROP POLICY IF EXISTS "budget_items_delete" ON public.budget_items;

CREATE POLICY "budget_items_select" ON public.budget_items
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "budget_items_insert" ON public.budget_items
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "budget_items_update" ON public.budget_items
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "budget_items_delete" ON public.budget_items
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );


-- =============================================================================
-- 9. materials / tools / labor_categories / crews
--    organization_id es TEXT (legacy) en estas tablas — mismo fix que master_materials:
--    inline EXISTS con cast organization_id::text en organization_members.
-- =============================================================================

ALTER TABLE public.materials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crews            ENABLE ROW LEVEL SECURITY;

-- ── materials ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "materials_select" ON public.materials;
DROP POLICY IF EXISTS "materials_insert" ON public.materials;
DROP POLICY IF EXISTS "materials_update" ON public.materials;
DROP POLICY IF EXISTS "materials_delete" ON public.materials;

CREATE POLICY "materials_select" ON public.materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = materials.organization_id
    )
  );
CREATE POLICY "materials_insert" ON public.materials
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = materials.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "materials_update" ON public.materials
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = materials.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = materials.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "materials_delete" ON public.materials
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = materials.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );

-- ── tools ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tools_select" ON public.tools;
DROP POLICY IF EXISTS "tools_insert" ON public.tools;
DROP POLICY IF EXISTS "tools_update" ON public.tools;
DROP POLICY IF EXISTS "tools_delete" ON public.tools;

CREATE POLICY "tools_select" ON public.tools
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = tools.organization_id
    )
  );
CREATE POLICY "tools_insert" ON public.tools
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = tools.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "tools_update" ON public.tools
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = tools.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = tools.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "tools_delete" ON public.tools
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = tools.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );

-- ── labor_categories ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "labor_categories_select" ON public.labor_categories;
DROP POLICY IF EXISTS "labor_categories_insert" ON public.labor_categories;
DROP POLICY IF EXISTS "labor_categories_update" ON public.labor_categories;
DROP POLICY IF EXISTS "labor_categories_delete" ON public.labor_categories;

CREATE POLICY "labor_categories_select" ON public.labor_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = labor_categories.organization_id
    )
  );
CREATE POLICY "labor_categories_insert" ON public.labor_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = labor_categories.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "labor_categories_update" ON public.labor_categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = labor_categories.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = labor_categories.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "labor_categories_delete" ON public.labor_categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = labor_categories.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );

-- ── crews ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "crews_select" ON public.crews;
DROP POLICY IF EXISTS "crews_insert" ON public.crews;
DROP POLICY IF EXISTS "crews_update" ON public.crews;
DROP POLICY IF EXISTS "crews_delete" ON public.crews;

CREATE POLICY "crews_select" ON public.crews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = crews.organization_id
    )
  );
CREATE POLICY "crews_insert" ON public.crews
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = crews.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "crews_update" ON public.crews
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = crews.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = crews.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "crews_delete" ON public.crews
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = crews.organization_id
        AND role                = ANY(ARRAY['owner','admin','editor'])
    )
  );


-- =============================================================================
-- 10. master_materials
--     organization_id es TEXT (legacy, guarda 'org_a' etc.) — NO uuid.
--     No se puede llamar is_org_member(text) porque internamente compara
--     organization_members.organization_id (uuid) = text → error de tipo.
--     Fix: EXISTS inline con cast explícito uuid → text en el lado de organization_members.
-- =============================================================================

ALTER TABLE public.master_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_materials_select" ON public.master_materials;
DROP POLICY IF EXISTS "master_materials_insert" ON public.master_materials;
DROP POLICY IF EXISTS "master_materials_update" ON public.master_materials;
DROP POLICY IF EXISTS "master_materials_delete" ON public.master_materials;

CREATE POLICY "master_materials_select" ON public.master_materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id            = auth.uid()
        AND organization_id::text = master_materials.organization_id
    )
  );

CREATE POLICY "master_materials_insert" ON public.master_materials
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id            = auth.uid()
        AND organization_id::text = master_materials.organization_id
        AND role               = ANY(ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "master_materials_update" ON public.master_materials
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id            = auth.uid()
        AND organization_id::text = master_materials.organization_id
        AND role               = ANY(ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id            = auth.uid()
        AND organization_id::text = master_materials.organization_id
        AND role               = ANY(ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "master_materials_delete" ON public.master_materials
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id            = auth.uid()
        AND organization_id::text = master_materials.organization_id
        AND role               = ANY(ARRAY['owner','admin','editor'])
    )
  );


-- =============================================================================
-- 11. master_tasks
--     Filas globales (organization_id IS NULL): todos pueden leer, nadie puede escribir.
--     Filas privadas (organization_id IS NOT NULL): solo miembros de esa org.
-- =============================================================================

ALTER TABLE public.master_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_tasks_select_global"  ON public.master_tasks;
DROP POLICY IF EXISTS "master_tasks_select_private" ON public.master_tasks;
DROP POLICY IF EXISTS "master_tasks_insert"         ON public.master_tasks;
DROP POLICY IF EXISTS "master_tasks_update"         ON public.master_tasks;
DROP POLICY IF EXISTS "master_tasks_delete"         ON public.master_tasks;

-- Catálogo global: lectura pública para autenticados
CREATE POLICY "master_tasks_select_global" ON public.master_tasks
  FOR SELECT TO authenticated
  USING ( organization_id IS NULL );

-- Catálogo privado: solo miembros de la org
CREATE POLICY "master_tasks_select_private" ON public.master_tasks
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member(organization_id)
  );

CREATE POLICY "master_tasks_insert" ON public.master_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );

CREATE POLICY "master_tasks_update" ON public.master_tasks
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );

CREATE POLICY "master_tasks_delete" ON public.master_tasks
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );


-- =============================================================================
-- 12. master_task_materials / master_task_labor / master_task_equipment
--     Tablas hijas de master_tasks — acceso via JOIN al padre.
--     No tienen organization_id propio: se verifica via master_tasks.
-- =============================================================================

ALTER TABLE public.master_task_materials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_task_labor      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_task_equipment  ENABLE ROW LEVEL SECURITY;

-- master_task_materials
DROP POLICY IF EXISTS "mtm_select" ON public.master_task_materials;
DROP POLICY IF EXISTS "mtm_insert" ON public.master_task_materials;
DROP POLICY IF EXISTS "mtm_update" ON public.master_task_materials;
DROP POLICY IF EXISTS "mtm_delete" ON public.master_task_materials;

CREATE POLICY "mtm_select" ON public.master_task_materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND (
          mt.organization_id IS NULL
          OR is_org_member(mt.organization_id)
        )
    )
  );

CREATE POLICY "mtm_insert" ON public.master_task_materials
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "mtm_update" ON public.master_task_materials
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "mtm_delete" ON public.master_task_materials
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );

-- master_task_labor
DROP POLICY IF EXISTS "mtl_select" ON public.master_task_labor;
DROP POLICY IF EXISTS "mtl_insert" ON public.master_task_labor;
DROP POLICY IF EXISTS "mtl_update" ON public.master_task_labor;
DROP POLICY IF EXISTS "mtl_delete" ON public.master_task_labor;

CREATE POLICY "mtl_select" ON public.master_task_labor
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND (mt.organization_id IS NULL OR is_org_member(mt.organization_id))
    )
  );
CREATE POLICY "mtl_insert" ON public.master_task_labor
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "mtl_update" ON public.master_task_labor
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "mtl_delete" ON public.master_task_labor
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );

-- master_task_equipment
DROP POLICY IF EXISTS "mte_select" ON public.master_task_equipment;
DROP POLICY IF EXISTS "mte_insert" ON public.master_task_equipment;
DROP POLICY IF EXISTS "mte_update" ON public.master_task_equipment;
DROP POLICY IF EXISTS "mte_delete" ON public.master_task_equipment;

CREATE POLICY "mte_select" ON public.master_task_equipment
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND (mt.organization_id IS NULL OR is_org_member(mt.organization_id))
    )
  );
CREATE POLICY "mte_insert" ON public.master_task_equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "mte_update" ON public.master_task_equipment
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "mte_delete" ON public.master_task_equipment
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );


-- =============================================================================
-- 13. budget_templates / budget_template_items
-- =============================================================================

ALTER TABLE public.budget_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_template_items ENABLE ROW LEVEL SECURITY;

-- budget_templates
DROP POLICY IF EXISTS "budget_templates_select" ON public.budget_templates;
DROP POLICY IF EXISTS "budget_templates_insert" ON public.budget_templates;
DROP POLICY IF EXISTS "budget_templates_update" ON public.budget_templates;
DROP POLICY IF EXISTS "budget_templates_delete" ON public.budget_templates;

CREATE POLICY "budget_templates_select" ON public.budget_templates
  FOR SELECT TO authenticated USING ( is_org_member(organization_id) );
CREATE POLICY "budget_templates_insert" ON public.budget_templates
  FOR INSERT TO authenticated WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );
CREATE POLICY "budget_templates_update" ON public.budget_templates
  FOR UPDATE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );
CREATE POLICY "budget_templates_delete" ON public.budget_templates
  FOR DELETE TO authenticated USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

-- budget_template_items (sin organization_id propio — via parent)
DROP POLICY IF EXISTS "bti_select" ON public.budget_template_items;
DROP POLICY IF EXISTS "bti_insert" ON public.budget_template_items;
DROP POLICY IF EXISTS "bti_update" ON public.budget_template_items;
DROP POLICY IF EXISTS "bti_delete" ON public.budget_template_items;

CREATE POLICY "bti_select" ON public.budget_template_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_templates bt
      WHERE bt.id = budget_template_id
        AND is_org_member(bt.organization_id)
    )
  );
CREATE POLICY "bti_insert" ON public.budget_template_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_templates bt
      WHERE bt.id = budget_template_id
        AND is_org_member_with_role(bt.organization_id, ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "bti_update" ON public.budget_template_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_templates bt
      WHERE bt.id = budget_template_id
        AND is_org_member_with_role(bt.organization_id, ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_templates bt
      WHERE bt.id = budget_template_id
        AND is_org_member_with_role(bt.organization_id, ARRAY['owner','admin','editor'])
    )
  );
CREATE POLICY "bti_delete" ON public.budget_template_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_templates bt
      WHERE bt.id = budget_template_id
        AND is_org_member_with_role(bt.organization_id, ARRAY['owner','admin','editor'])
    )
  );


-- =============================================================================
-- 14. catalogs / resources / catalog_task_yields
--     Catálogo global (organization_id IS NULL): solo lectura para todos.
--     Catálogo privado de org: solo miembros.
--     Eliminamos los USING (true) de migration 001.
-- =============================================================================

-- catalogs
DROP POLICY IF EXISTS "catalogs_select"         ON public.catalogs;
DROP POLICY IF EXISTS "catalogs_select_global"  ON public.catalogs;
DROP POLICY IF EXISTS "catalogs_select_private" ON public.catalogs;
DROP POLICY IF EXISTS "catalogs_insert"         ON public.catalogs;
DROP POLICY IF EXISTS "catalogs_update"         ON public.catalogs;
DROP POLICY IF EXISTS "catalogs_delete"         ON public.catalogs;

CREATE POLICY "catalogs_select_global" ON public.catalogs
  FOR SELECT TO authenticated
  USING ( organization_id IS NULL );

CREATE POLICY "catalogs_select_private" ON public.catalogs
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member(organization_id)
  );

CREATE POLICY "catalogs_insert" ON public.catalogs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );

CREATE POLICY "catalogs_update" ON public.catalogs
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );

CREATE POLICY "catalogs_delete" ON public.catalogs
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin'])
  );

-- resources
DROP POLICY IF EXISTS "resources_select"         ON public.resources;
DROP POLICY IF EXISTS "resources_select_global"  ON public.resources;
DROP POLICY IF EXISTS "resources_select_private" ON public.resources;
DROP POLICY IF EXISTS "resources_insert"         ON public.resources;
DROP POLICY IF EXISTS "resources_update"         ON public.resources;
DROP POLICY IF EXISTS "resources_delete"         ON public.resources;

CREATE POLICY "resources_select_global" ON public.resources
  FOR SELECT TO authenticated
  USING ( organization_id IS NULL );

CREATE POLICY "resources_select_private" ON public.resources
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member(organization_id)
  );

CREATE POLICY "resources_insert" ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );

CREATE POLICY "resources_update" ON public.resources
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );

CREATE POLICY "resources_delete" ON public.resources
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
  );

-- catalog_task_yields (sin organization_id propio — via catalogs > resources > master_tasks)
-- Acceso determinado por el catálogo al que pertenece la master_task
DROP POLICY IF EXISTS "catalog_task_yields_select" ON public.catalog_task_yields;
DROP POLICY IF EXISTS "catalog_task_yields_insert" ON public.catalog_task_yields;
DROP POLICY IF EXISTS "catalog_task_yields_delete" ON public.catalog_task_yields;

CREATE POLICY "catalog_task_yields_select" ON public.catalog_task_yields
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND (
          mt.organization_id IS NULL
          OR is_org_member(mt.organization_id)
        )
    )
  );

CREATE POLICY "catalog_task_yields_insert" ON public.catalog_task_yields
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "catalog_task_yields_delete" ON public.catalog_task_yields
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id
        AND mt.organization_id IS NOT NULL
        AND is_org_member_with_role(mt.organization_id, ARRAY['owner','admin','editor'])
    )
  );


-- =============================================================================
-- 15. task_crew_yields
--     Sin organization_id propio: columnas son task_id, crew_id, quantity.
--     Acceso via JOIN a tasks (que sí tiene organization_id).
-- =============================================================================

ALTER TABLE public.task_crew_yields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_crew_yields_select" ON public.task_crew_yields;
DROP POLICY IF EXISTS "task_crew_yields_insert" ON public.task_crew_yields;
DROP POLICY IF EXISTS "task_crew_yields_update" ON public.task_crew_yields;
DROP POLICY IF EXISTS "task_crew_yields_delete" ON public.task_crew_yields;

CREATE POLICY "task_crew_yields_select" ON public.task_crew_yields
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND is_org_member(t.organization_id)
    )
  );

CREATE POLICY "task_crew_yields_insert" ON public.task_crew_yields
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND is_org_member_with_role(t.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "task_crew_yields_update" ON public.task_crew_yields
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND is_org_member_with_role(t.organization_id, ARRAY['owner','admin','editor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND is_org_member_with_role(t.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "task_crew_yields_delete" ON public.task_crew_yields
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND is_org_member_with_role(t.organization_id, ARRAY['owner','admin','editor'])
    )
  );
