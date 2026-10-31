-- LOCAL STAGING BASELINE only: create pre-existing legacy tables missing from Git history.
-- DO NOT DEPLOY TO CLOUD/PRODUCTION. Derived from read-only column metadata, not production rows.
-- The historical migrations 001+ assume these tables already existed.
-- Constraint and column compatibility require a full local supabase start test.

BEGIN;

CREATE TABLE IF NOT EXISTS public."organizations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (slug)
);
ALTER TABLE public."organizations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."profiles" (
  "id" uuid NOT NULL,
  "full_name" text,
  "default_organization_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email" text,
  "system_role" text DEFAULT 'user'::text NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."organization_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (organization_id, user_id),
  CHECK (role IN ('owner','admin','editor','viewer'))
);
ALTER TABLE public."organization_members" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."invitations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "invited_email" text,
  "role" text DEFAULT 'editor'::text NOT NULL,
  "token" text DEFAULT (gen_random_uuid())::text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  "accepted_at" timestamp with time zone,
  "accepted_by" uuid,
  PRIMARY KEY (id),
  UNIQUE (token)
);
ALTER TABLE public."invitations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."projects" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "client" text,
  "client_id" text,
  "currency" text DEFAULT 'ARS'::text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "status" text DEFAULT 'planning'::text NOT NULL,
  "working_days" jsonb DEFAULT '[1, 2, 3, 4, 5]'::jsonb NOT NULL,
  "non_working_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "workday_hours" numeric(8,2) DEFAULT 9 NOT NULL,
  "pricing_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "address" text,
  "ggd_pct" numeric(8,6),
  "ggi_pct" numeric(8,6),
  "profit_pct" numeric(8,6),
  "tax_pct" numeric(8,6),
  "company_name" text,
  "surface" numeric(14,4),
  "construction_system" text,
  "structure_type" text,
  "foundation_type" text,
  "cost_base" date,
  "workday_start_time" text,
  "workday_end_time" text,
  "lunch_break_duration" integer,
  "labor_force" jsonb,
  "assigned_crews" jsonb,
  "pricing" jsonb,
  "dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."master_tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "code" text,
  "name" text NOT NULL,
  "description" text,
  "unit" text NOT NULL,
  "category" text,
  "daily_yield" numeric(14,4) DEFAULT 1 NOT NULL,
  "fixed_cost" numeric(14,4) DEFAULT 0 NOT NULL,
  "fixed_cost_description" text,
  "specifications" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_metadata" jsonb,
  PRIMARY KEY (id)
);
ALTER TABLE public."master_tasks" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "master_task_id" uuid,
  "code" text,
  "name" text NOT NULL,
  "unit" text NOT NULL,
  "category" text,
  "labor_cost" numeric(14,4) DEFAULT 0 NOT NULL,
  "daily_yield" numeric(14,4) DEFAULT 1 NOT NULL,
  "fixed_cost" numeric(14,4) DEFAULT 0 NOT NULL,
  "fixed_cost_description" text,
  "specifications" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."tasks" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."materials" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "unit" text DEFAULT ''::text NOT NULL,
  "cost" numeric DEFAULT 0 NOT NULL,
  "category" text,
  "min_stock" numeric,
  "provider" text,
  "family" text,
  "description" text,
  "commercial_format" text,
  "waste_percent" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "code" text,
  "commercial_unit" text,
  "conversion_factor" numeric,
  PRIMARY KEY (id)
);
ALTER TABLE public."materials" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."tools" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT ''::text NOT NULL,
  "cost_per_hour" numeric DEFAULT 0 NOT NULL,
  "family" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "code" text,
  PRIMARY KEY (id)
);
ALTER TABLE public."tools" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."labor_categories" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "role" text NOT NULL,
  "basic_hourly_rate" numeric DEFAULT 0 NOT NULL,
  "social_charges_percent" numeric DEFAULT 0 NOT NULL,
  "insurance_percent" numeric DEFAULT 0 NOT NULL,
  "description" text,
  "family" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "code" text,
  PRIMARY KEY (id)
);
ALTER TABLE public."labor_categories" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."crews" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "composition" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."crews" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."master_materials" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text,
  "code" text,
  "name" text NOT NULL,
  "description" text,
  "unit" text NOT NULL,
  "unit_price" numeric(12,4) DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'ARS'::text NOT NULL,
  "category" text,
  "supplier" text,
  "commercial_format" text,
  "waste_percent" numeric(5,2) DEFAULT 0,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_price_update" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "commercial_unit" text,
  "conversion_factor" numeric,
  "global_source_id" uuid,
  "imported_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "local_override" boolean DEFAULT false NOT NULL,
  "global_source_updated_at_at_import" timestamp with time zone,
  "global_resource_id" uuid,
  "technical_yield" numeric,
  "technical_yield_unit" text,
  "technical_notes" text,
  PRIMARY KEY (id)
);
ALTER TABLE public."master_materials" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."master_task_materials" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "master_task_id" uuid NOT NULL,
  "master_material_id" uuid,
  "material_name" text NOT NULL,
  "unit" text NOT NULL,
  "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
  "waste_percent" numeric(8,4) DEFAULT 0 NOT NULL,
  "last_known_unit_price" numeric(14,4) DEFAULT 0 NOT NULL,
  "resource_id" uuid,
  "sub_master_task_id" uuid,
  "conversion_factor" numeric(10,6),
  "commercial_unit" text,
  PRIMARY KEY (id)
);
ALTER TABLE public."master_task_materials" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."master_task_labor" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "master_task_id" uuid NOT NULL,
  "labor_category_id" text NOT NULL,
  "labor_category_name" text NOT NULL,
  "quantity" numeric(14,4) DEFAULT 1 NOT NULL,
  "resource_id" uuid,
  "snapshot_hourly_rate" numeric(18,4),
  PRIMARY KEY (id)
);
ALTER TABLE public."master_task_labor" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."master_task_equipment" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "master_task_id" uuid NOT NULL,
  "tool_id" text NOT NULL,
  "tool_name" text NOT NULL,
  "hours_per_unit" numeric(14,4) DEFAULT 0 NOT NULL,
  "resource_id" uuid,
  "snapshot_cost_per_hour" numeric(18,4),
  PRIMARY KEY (id)
);
ALTER TABLE public."master_task_equipment" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."task_yields" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "material_id" text NOT NULL,
  "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
  "waste_percent" numeric(8,4) DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."task_yields" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."task_labor_yields" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "labor_category_id" text NOT NULL,
  "quantity" numeric(14,4) DEFAULT 1 NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."task_labor_yields" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."task_tool_yields" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "tool_id" text NOT NULL,
  "hours_per_unit" numeric(14,4) DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."task_tool_yields" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."task_crew_yields" (
  "task_id" text NOT NULL,
  "crew_id" text NOT NULL,
  "quantity" numeric DEFAULT 0 NOT NULL,
  PRIMARY KEY (task_id,crew_id)
);
ALTER TABLE public."task_crew_yields" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."budget_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
  "start_date" date,
  "end_date" date,
  "status" text,
  "progress" numeric(8,4) DEFAULT 0 NOT NULL,
  "dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "manual_duration" integer,
  "crews_assigned" integer DEFAULT 1 NOT NULL,
  "efficiency_factor" numeric(8,4),
  "allowance_percent" numeric(8,4),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sort_order" integer,
  "computation_item_id" uuid,
  PRIMARY KEY (id)
);
ALTER TABLE public."budget_items" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."budget_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."budget_templates" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."budget_template_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "budget_template_id" uuid NOT NULL,
  "master_task_id" uuid NOT NULL,
  "quantity" numeric(14,4) DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public."budget_template_items" ENABLE ROW LEVEL SECURITY;

-- Initial referential integrity for pre-existing relations.
ALTER TABLE public."profiles" ADD CONSTRAINT "bootstrap_profiles_id_fk" FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;
ALTER TABLE public."profiles" ADD CONSTRAINT "bootstrap_profiles_default_organization_id_fk" FOREIGN KEY ("default_organization_id") REFERENCES public.organizations("id") ON DELETE SET NULL;
ALTER TABLE public."organization_members" ADD CONSTRAINT "bootstrap_organization_members_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."organization_members" ADD CONSTRAINT "bootstrap_organization_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
ALTER TABLE public."invitations" ADD CONSTRAINT "bootstrap_invitations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."invitations" ADD CONSTRAINT "bootstrap_invitations_created_by_fk" FOREIGN KEY ("created_by") REFERENCES auth.users("id") ON DELETE NO ACTION;
ALTER TABLE public."invitations" ADD CONSTRAINT "bootstrap_invitations_accepted_by_fk" FOREIGN KEY ("accepted_by") REFERENCES auth.users("id") ON DELETE NO ACTION;
ALTER TABLE public."projects" ADD CONSTRAINT "bootstrap_projects_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."master_tasks" ADD CONSTRAINT "bootstrap_master_tasks_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."tasks" ADD CONSTRAINT "bootstrap_tasks_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."tasks" ADD CONSTRAINT "bootstrap_tasks_master_task_id_fk" FOREIGN KEY ("master_task_id") REFERENCES public.master_tasks("id") ON DELETE SET NULL;
ALTER TABLE public."master_task_materials" ADD CONSTRAINT "bootstrap_master_task_materials_master_task_id_fk" FOREIGN KEY ("master_task_id") REFERENCES public.master_tasks("id") ON DELETE CASCADE;
ALTER TABLE public."master_task_materials" ADD CONSTRAINT "bootstrap_master_task_materials_master_material_id_fk" FOREIGN KEY ("master_material_id") REFERENCES public.master_materials("id") ON DELETE SET NULL;
ALTER TABLE public."master_task_materials" ADD CONSTRAINT "bootstrap_master_task_materials_sub_master_task_id_fk" FOREIGN KEY ("sub_master_task_id") REFERENCES public.master_tasks("id") ON DELETE SET NULL;
ALTER TABLE public."master_task_labor" ADD CONSTRAINT "bootstrap_master_task_labor_master_task_id_fk" FOREIGN KEY ("master_task_id") REFERENCES public.master_tasks("id") ON DELETE CASCADE;
ALTER TABLE public."master_task_equipment" ADD CONSTRAINT "bootstrap_master_task_equipment_master_task_id_fk" FOREIGN KEY ("master_task_id") REFERENCES public.master_tasks("id") ON DELETE CASCADE;
ALTER TABLE public."task_yields" ADD CONSTRAINT "bootstrap_task_yields_task_id_fk" FOREIGN KEY ("task_id") REFERENCES public.tasks("id") ON DELETE CASCADE;
ALTER TABLE public."task_yields" ADD CONSTRAINT "bootstrap_task_yields_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."task_labor_yields" ADD CONSTRAINT "bootstrap_task_labor_yields_task_id_fk" FOREIGN KEY ("task_id") REFERENCES public.tasks("id") ON DELETE CASCADE;
ALTER TABLE public."task_labor_yields" ADD CONSTRAINT "bootstrap_task_labor_yields_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."task_tool_yields" ADD CONSTRAINT "bootstrap_task_tool_yields_task_id_fk" FOREIGN KEY ("task_id") REFERENCES public.tasks("id") ON DELETE CASCADE;
ALTER TABLE public."task_tool_yields" ADD CONSTRAINT "bootstrap_task_tool_yields_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."budget_items" ADD CONSTRAINT "bootstrap_budget_items_project_id_fk" FOREIGN KEY ("project_id") REFERENCES public.projects("id") ON DELETE CASCADE;
ALTER TABLE public."budget_items" ADD CONSTRAINT "bootstrap_budget_items_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."budget_items" ADD CONSTRAINT "bootstrap_budget_items_task_id_fk" FOREIGN KEY ("task_id") REFERENCES public.tasks("id") ON DELETE RESTRICT;
ALTER TABLE public."budget_templates" ADD CONSTRAINT "bootstrap_budget_templates_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES public.organizations("id") ON DELETE CASCADE;
ALTER TABLE public."budget_template_items" ADD CONSTRAINT "bootstrap_budget_template_items_budget_template_id_fk" FOREIGN KEY ("budget_template_id") REFERENCES public.budget_templates("id") ON DELETE CASCADE;
ALTER TABLE public."budget_template_items" ADD CONSTRAINT "bootstrap_budget_template_items_master_task_id_fk" FOREIGN KEY ("master_task_id") REFERENCES public.master_tasks("id") ON DELETE RESTRICT;

COMMIT;
