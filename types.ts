
// Definición de las entidades base del sistema

export type Role = 'admin' | 'project_manager' | 'worker' | 'client';

/** Roles a nivel sistema (independientes del org role). Columna profiles.system_role. */
export type SystemRole = 'master_admin' | 'tester' | 'user';

// NEW: Cost Families based on User Request
export type CostFamily = 'MATERIAL' | 'MANO DE OBRA' | 'EQUIPOS' | 'SUBCONTRATO' | 'COSTO INDIRECTO';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string; // Tenant ID
  systemRole?: SystemRole; // System-level role (independent of org membership)
}

export enum LinkType {
  FS = 'FC', // Fin-Comienzo
  SS = 'CC', // Comienzo-Comienzo
  FF = 'FF', // Fin-Fin
  SF = 'CF'  // Comienzo-Fin
}

export interface Dependency {
  predecessorId: string; // ID de otro BudgetItem
  type: LinkType;
  lag: number; // Días de demora (positivo o negativo)
}

export interface Material {
  id: string;
  organizationId: string; // Multitenant
  code?: string;           // Código de catálogo (ej: I1001). Único por org. Agregado en migración 020.
  name: string;
  unit: string;
  cost: number;
  category?: string;
  minStock?: number;
  provider?: string;
  family?: CostFamily; // Optional override, defaults to MATERIAL

  // NEW: Extended Fields
  description?: string;
  commercialFormat?: string; // e.g. "Bolsa 50kg", "Barra 12m"
  wastePercent?: number; // Standard waste percentage
  commercialUnit?: string;    // Etiqueta unidad de compra. Ej: "bolsa 50 kg"
  conversionFactor?: number;  // 1 unidad comercial = N unidades técnicas. Ej: bolsa → 50 (kg)
}

export interface Tool {
  id: string;
  organizationId: string; // Multitenant
  code?: string;           // Código de catálogo (ej: I1747). Único por org. Agregado en migración 020.
  name: string;
  category: string;
  costPerHour: number;
  family?: CostFamily; // Optional override, defaults to EQUIPOS
}

export interface LaborCategory {
  id: string;
  organizationId: string; // Multitenant
  code?: string;           // Código de catálogo (ej: I1004). Único por org. Agregado en migración 020.
  role: string; // Nombre del rol (ej: Oficial Especializado)
  basicHourlyRate: number; // Valor hora de bolsillo/básico
  socialChargesPercent: number; // % Cargas Sociales, Fondo Desempleo, Presentismo
  insurancePercent: number; // % Seguros y otros
  description?: string;
  family?: CostFamily; // Optional override, defaults to MANO DE OBRA
}

// --- CREW (CUADRILLAS) ---
export interface CrewComposition {
  laborCategoryId: string;
  count: number;
  participation?: number; // % de incidencia (Defecto 100). Ej: 50% si el ayudante es compartido.
}

export interface Crew {
  id: string;
  organizationId: string;
  name: string; // Ej: "Cuadrilla Hormigón (1+3)"
  description?: string;
  composition: CrewComposition[]; // Lista de integrantes
}

// --- STANDARD YIELDS SCHEMA (CHANDÍAS BASELINE) ---
export interface StandardYields {
    materials?: { materialId: string; quantity: number; wastePercent: number }[];
    labor?: { laborCategoryId: string; hhPerUnit: number }[]; // HH por unidad
    equipment?: { toolId: string; hoursPerUnit: number }[];
}

export interface Task {
  id: string;
  organizationId: string; // Multitenant
  name: string; 
  description?: string; // NEW: Extended description
  unit: string; 
  laborCost: number; // Costo Manual (Legacy o Alternativo)
  dailyYield: number; // Rendimiento Diario Standard (u/dia)
  category?: string;
  
  // NEW: Costos fijos por unidad (Fletes, Ayuda Gremio, Subcontrato específico)
  fixedCost?: number; 
  fixedCostDescription?: string;
  
  // NEW: Excel Import Fields
  code?: string; // Código de Tarea (Columna 0 del Excel)
  specifications?: string; // Especificación Técnica (Columna 6 del Excel)

  // NEW: Engineering Standard (Coscarella / Chandías)
  yieldHH?: number; // Rendimiento en Horas Hombre por Unidad (hh/u)
  defaultPredecessorId?: string; // Sugerencia de secuencia lógica (precedenciaId)

  // NEW: Baseline for Comparison (The "Standard" vs the "Real" in Context)
  standardYields?: StandardYields; 

  // NEW: Virtual properties for Sync (Pass-through objects)
  materialsYield?: TaskYield[];
  equipmentYield?: TaskToolYield[];
  laborYield?: TaskCrewYield[];
  laborIndividualYield?: TaskLaborYield[]; // New (Individuals)

  // Trazabilidad: ID de la MasterTask origen (si la tarea fue importada desde APU Maestro)
  masterTaskId?: string;
}

export interface TaskYield {
  taskId: string;
  materialId: string;
  quantity: number; // Cantidad Neta
  wastePercent?: number; // Desperdicio Real Adicional
  organizationId?: string;
  resourceId?: string; // UUID recurso — motor de costos versionado
}

export interface TaskToolYield {
  taskId: string;
  toolId: string;
  hoursPerUnit: number;
  organizationId?: string;
  resourceId?: string; // UUID recurso — motor de costos versionado
}

export interface TaskCrewYield {
  taskId: string;
  crewId: string;
  quantity: number; // Cantidad de cuadrillas asignadas (usualmente 1)
}

export interface TaskLaborYield {
  taskId: string;
  laborCategoryId: string;
  quantity: number; // Cantidad de oficiales (ej: 0.5, 1, 2)
  organizationId?: string;
  resourceId?: string; // UUID recurso — motor de costos versionado
}



export interface Holiday {
  date: string; // YYYY-MM-DD
  description: string;
}

export interface CalendarPreset {
  id: string;
  name: string;
  workdayHours: number;
  workdayStartTime: string;
  workdayEndTime: string;
  lunchBreakDuration: number;
  workingDays: number[];
  nonWorkingDates: Holiday[];
}

// Estructura de Gastos Indirectos (PDF Costos)
// Modelo legacy — se mantiene para compatibilidad con project.pricing existente.
// El nuevo Cuadro Empresario usa BusinessConfig (ver store/useBudgetKStore.ts).
export interface PricingConfig {
    generalExpensesPercent: number; // Gastos Generales (GGO + GGE) -> COSTO INDIRECTO
    financialExpensesPercent: number; // Gastos Financieros
    profitPercent: number; // Beneficio / Utilidad
    taxPercent: number; // Impuestos (IVA/IIBB)
}

/**
 * Cuadro Empresario — Coeficiente de Pase K.
 * Todos los porcentajes se almacenan como decimales: 0.08 = 8 %.
 * GGD  = Gastos Generales Directos  (obra, equipo, plantel en sitio).
 * GGI  = Gastos Generales Indirectos (administración, financieros, seguros).
 */
export interface BusinessConfig {
  ggdPct:    number; // Gastos Generales Directos   (ej: 0.08)
  ggiPct:    number; // Gastos Generales Indirectos (ej: 0.07)
  profitPct: number; // Beneficio / Utilidad        (ej: 0.10)
  taxPct:    number; // Impuestos IVA / IIBB        (ej: 0.21)
}

/** Resultado completo del Cuadro Empresario para un presupuesto. */
export interface BudgetKSummary {
  directCost:           number; // CD — suma de todos los items
  ggdAmount:            number; // CD × ggdPct
  ggiAmount:            number; // CD × ggiPct
  subtotalBeforeProfit: number; // CD + GGD + GGI
  profitAmount:         number; // subtotalBeforeProfit × profitPct
  subtotalBeforeTax:    number; // subtotalBeforeProfit + profitAmount
  taxAmount:            number; // subtotalBeforeTax × taxPct
  finalSalePrice:       number; // subtotalBeforeTax + taxAmount
  kFactor:              number; // finalSalePrice / directCost (1 si CD = 0)
  businessConfig:       BusinessConfig;
}

// NEW: Helper interfaces for Project specific labor definition
export interface ProjectLaborDefinition {
    laborCategoryId: string;
    count: number;
}

export interface ProjectCrewDefinition {
    crewId: string;
    count: number;
}

export type ProjectStatus = 'planning' | 'active' | 'completed' | 'suspended';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'delayed';

export interface Project {
  id: string;
  organizationId: string; // Multitenant
  name: string;
  client: string; // Client Name (Display)
  clientId?: string; // Foreign Key to Client/User
  address?: string;
  companyName?: string;
  currency: string;
  startDate: string;
  endDate?: string; // Fecha de Fin Prevista / Límite
  status: ProjectStatus; // NEW: Status field
  items: BudgetItem[];
  
  // Global Settings for Labor & Calendar
  workdayHours?: number; // Jornada laboral standard (ej 8 o 9hs) - Calculated or Manual
  workdayStartTime?: string; // "08:00"
  workdayEndTime?: string; // "17:00"
  lunchBreakDuration?: number; // in minutes
  workingDays?: number[]; // Array of days (0=Sun, 1=Mon... 6=Sat) that are working days
  nonWorkingDates?: Holiday[]; // Array of specific dates with descriptions
  
  globalEfficiency?: number; // Factor de rendimiento (ej 0.85)
  // Technical Specs
  surface?: number; // Superficie en m2
  constructionSystem?: string; // Tradicional, Steel Frame, etc.
  structureType?: string; // Hormigón, Metálica, etc.
  foundationType?: string; // Platea, Zapatas, etc.

  // Pricing Structure
  // LEGACY: solo vive en TypeScript/localStorage, nunca se persiste en Supabase.
  // Usar businessConfig para persistencia real.
  pricing?: PricingConfig;

  // Cuadro Empresario K — modelo persistido en Supabase (columnas ggd_pct, etc.)
  // undefined = proyecto sin config guardada; el store usa DEFAULT_BUSINESS_CONFIG.
  businessConfig?: BusinessConfig;

  // NEW: Project Specific Resource Availability
  laborForce?: ProjectLaborDefinition[]; // Available individual workers
  assignedCrews?: ProjectCrewDefinition[]; // Available crews

  // Motor de costos versionado (migration 010)
  costBase?: string; // YYYY-MM-DD último día del mes — "Base Marzo 2026" = "2026-03-31"
  // Centralized Dependencies (Normalized Model)
  dependencies?: ProjectDependency[];
}

export interface ProjectDependency {
  id: string;
  fromTaskId: string; // Predecessor (The task that must finish/start first)
  toTaskId: string;   // Successor (The task that depends on the predecessor)
  type: LinkType;
  lag: number; // Days
  note?: string;
}

export interface BudgetItem {
  id: string;
  projectId?: string;      // Set automatically by ERPContext; optional for legacy migration
  organizationId?: string; // Set automatically by ERPContext; required by Supabase RLS
  taskId: string; // Foreign Key to Master Task
  
  // Project-Specific Overrides (The "Task" entity in the requested schema)
  name?: string; // Nombre de la tarea (Override)
  description?: string; // Descripcion (Override)
  
  quantity: number; 
  
  // Planning / Scheduling
  startDate?: string; // FechaInicioEstimada
  endDate?: string; // FechaFinEstimada (Calculated or Manual)
  manualDuration?: number; // Duración forzada por el usuario
  
  responsibleId?: string; // ResponsableID (Foreign Key to User/Personal)
  status?: TaskStatus; // Estado
  
  dependencies?: Dependency[]; // Vinculaciones
  progress?: number; // Porcentaje de avance (0-100)
  
  // NEW: Planning specific overrides based on Methods & Time Study
  crewsAssigned?: number; // Frentes de ataque (Cant_Personal en fórmula Coscarella)
  efficiencyFactor?: number; // Valoración del Ritmo (fv). 1.0 = Normal (100%), 1.2 = Rápido, 0.8 = Lento
  allowancePercent?: number; // Suplementos (Fatiga, Necesidades, Contingencias). Ej: 15%

  // NEW: Tracking & Actuals (Seguimiento Real)
  actualStartDate?: string; // Fecha Real de Inicio
  actualEndDate?: string; // Fecha Real de Fin
  trackingNotes?: string; // Observaciones de seguimiento (ej: "Demora por lluvia")

  /** Orden de visualización en el presupuesto. NULL = ordenar por created_at. */
  sortOrder?: number;

  /** Vínculo opcional al computation_item de origen (Calculadora Chandías). Solo trazabilidad. */
  computationItemId?: string;
}

// ─── Sincronización Viva ───────────────────────────────────────────────────────

export type ComputationSessionStatus = 'draft' | 'approved' | 'frozen';

/** Sesión de cómputo paramétrico — agrupa computation_items del mismo contexto. */
export interface ComputationSession {
  id: string;
  projectId: string;
  organizationId: string;
  name?: string;
  status: ComputationSessionStatus;
  computedBy?: string;   // uuid del usuario auth
  computedAt: string;    // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

/** Snapshot técnico de un material (sin precios). */
export interface MaterialSnapshot {
  nombre: string;
  unit: string;
  coef: number;      // cantidad por unidad de tarea
  cantidad: number;  // coef × quantity
}

/** Snapshot de material manual (sin precios). */
export interface ManualMaterialSnapshot {
  id: string;
  nombre: string;
  unit: string;
  cantidad: number;
  code?: string;
}

/** Ítem individual de cómputo — rubro calculado con dims y snapshot técnico. */
export interface ComputationItem {
  id: string;
  computationId: string;
  organizationId: string;
  chandiasTaskId: string;    // ID en catálogo TypeScript (ej: 'FUN-001')
  masterTaskId?: string;     // FK opcional a master_tasks
  description?: string;
  dims: Record<string, number>;
  quantity: number;
  unidad: string;
  materialesSnapshot: MaterialSnapshot[];   // sin precios
  manualMaterials: ManualMaterialSnapshot[]; // sin precios
  steelDiameterMm?: number;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

// --- RECEPTION MODULE ---
export interface ReceptionItem {
  materialId: string;
  quantityDeclared: number; // Lo que dice el remito
  quantityReceived: number; // Lo que realmente entró (puede haber roturas)
  notes?: string;
}

export interface Reception {
  id: string;
  organizationId: string; // Multitenant
  projectId: string;
  date: string;
  remitoNumber: string;
  provider?: string;
  photoUrl?: string; // Base64 or URL
  items: ReceptionItem[];
  status: 'draft' | 'confirmed';
}

// --- SUBCONTRACTORS MODULE ---

export interface SubcontractorDocument {
    id: string;
    type: 'ART' | 'VIDA' | 'SVO' | 'CONTRATO' | 'OTRO';
    name: string;
    expirationDate: string;
    isValid: boolean;
}

export interface Subcontractor {
    id: string;
    organizationId: string; // Multitenant
    name: string;
    cuit: string;
    category: string; // Electricidad, Plomería, Albañilería
    phone?: string;
    email?: string;
    documents: SubcontractorDocument[];
}

export interface ContractItem {
    budgetItemId: string; // Link to project BudgetItem
    taskId: string; // Redundant but useful for UI
    agreedUnitPrice: number; // Puede diferir del presupuesto oficial
}

export interface Contract {
    id: string;
    organizationId: string; // Multitenant
    subcontractorId: string;
    projectId: string;
    description: string;
    startDate: string;
    retentionPercent: number; // Fondo de reparo (ej: 5%)
    items: ContractItem[];
    status: 'active' | 'closed' | 'draft';
}

export interface CertificationItem {
    contractItemId: string; // ID del ContractItem (task)
    percentageThisPeriod: number; // Avance del periodo
    amountThisPeriod: number; // Dinero del periodo
}

export interface Certification {
    id: string;
    organizationId: string; // Multitenant
    contractId: string;
    date: string;
    period: string; // "MM-YYYY"
    items: CertificationItem[];
    totalGross: number; // Bruto
    retentionAmount: number; // Retención calculada
    totalNet: number; // A pagar (Bruto - Retención)
    status: 'pending' | 'approved' | 'paid';
    evidenceUrl?: string; // URL de fotos analizadas por Visión Artificial
    approvalStatus?: 'pending_review' | 'approved' | 'rejected';
}

// --- PROJECT CERTIFICATES MODULE (Certificados de Avance de Obra) ---
// Entidad separada de Certification (subcontratistas).
// Snapshot inmutable: los valores se congelan al momento de emisión y no cambian
// aunque luego cambien los precios del presupuesto o el avance de los ítems.

export interface ProjectCertificateItem {
  budgetItemId: string;
  taskId: string;
  description: string;        // snapshot del nombre de tarea al momento de emisión
  unit: string;
  quantity: number;
  unitPrice: number;          // snapshot de itemCost.unitCost al momento de emisión
  totalBudgeted: number;      // quantity * unitPrice (snapshot)
  progressPercent: number;    // item.progress al momento de emisión (0–100)
  amountCertified: number;    // totalBudgeted * progressPercent / 100 (snapshot)
}

export interface ProjectCertificate {
  id: string;
  organizationId: string;
  projectId: string;
  number: number;              // secuencial por projectId (1, 2, 3…)
  period: string;              // "YYYY-MM"
  date: string;                // ISO timestamp de emisión
  items: ProjectCertificateItem[];
  totalBudgeted: number;       // BAC snapshot al momento de emisión
  totalCertified: number;      // sum(amountCertified) — avance acumulado hasta este certificado
  previouslyCertified: number; // totalCertified del certificado anterior (0 si es el primero)
  thisPeriodAmount: number;    // totalCertified - previouslyCertified
  status: 'draft' | 'issued' | 'approved';
}

// --- DOCUMENT MANAGEMENT MODULE ---
export interface ProjectDocument {
    id: string;
    organizationId: string;
    projectId: string;
    name: string;
    type: 'PLAN' | 'CONTRACT' | 'INVOICE' | 'SPEC' | 'OTHER';
    format: 'PDF' | 'DWG' | 'XLSX' | 'JPG' | 'IFC' | 'DOCX';
    uploadDate: string;
    uploadedBy: string; // User ID/Name
    metadata?: Record<string, any>; // Extracted Metadata (Spatial coords, etc)
    url?: string; // Mock URL
}

// --- MEASUREMENT SHEETS (CÓMPUTOS MÉTRICOS) ---
export interface MeasurementLine {
    id: string;
    description: string; // "Muro Eje A", "Columna C1"
    length: number;
    width: number;
    height: number;
    count: number; // Cantidad de veces que se repite
    subtotal: number; // Calculated (L*W*H*Count) or manually overridden
}

export interface MeasurementSheet {
    id: string; // Unique ID
    organizationId: string;
    budgetItemId: string; // Link to specific budget item (The Bridge)
    lines: MeasurementLine[];
    totalQuantity: number;
    lastUpdated: string;
    updatedBy: string;
}

// --- QUALITY MANAGEMENT MODULE (GESTION DE CALIDAD) ---

export type ControlType = 'variable' | 'attribute';

export interface QualityCheckItem {
    id: string;
    description: string; // "Verificar plomo", "Asentamiento (Slump)"
    type: ControlType;
    acceptanceCriteria?: string; // "≤ 2mm/m", "Sin fisuras visibles", "10 +/- 2 cm"
    // For Variables (Numeric)
    unit?: string;
    minValue?: number;
    maxValue?: number;
}

export interface QualityProtocol {
    id: string;
    organizationId: string;
    name: string; // e.g. "Protocolo de Hormigonado", "Control de Mampostería"
    category: string; // Rubro associated
    checks: QualityCheckItem[];
}

export interface QualityInspection {
    id: string;
    organizationId: string;
    projectId: string;
    taskId: string; // Linked to a BudgetItem/Task
    protocolId: string;
    date: string;
    inspector: string; // User Name
    status: 'passed' | 'failed' | 'conditional';
    // Results store: key = checkItem.id, value = number (variable) or boolean (attribute)
    results: Record<string, any>; 
    comments?: string;
    photos?: string[];
}

export interface NonConformity {
    id: string;
    organizationId: string;
    projectId: string;
    inspectionId?: string; // Linked to an inspection (optional, can be standalone)
    date: string;
    description: string;
    severity: 'critical' | 'major' | 'minor'; // From PDF Slide 31
    correctiveAction: string;
    status: 'open' | 'closed';
    assignedTo?: string; // Responsible person
}

export interface ComputationResult {
    id: string;
    organizationId: string;
    projectId: string;
    budgetItemId: string; // The item this calculation belongs to
    computationTaskId: string; // The template used (e.g., "Muro 0.15")
    inputValues: Record<string, any>; // e.g. { "Largo": 5, "Alto": 3 }
    resultQuantity: number; // The calculated result
    createdAt: string;
}

export interface ComputationParameter {
    name: string;
    type: 'number' | 'string' | 'enum';
    unit?: string;
    options?: string[]; // For enum
    min?: number;
    max?: number;
    defaultValue?: any;
}

export interface ComputationTask {
    id: string;
    rubroId: string;
    name: string;
    unit: string;
    description: string;
    parameters: ComputationParameter[];
    formulaExample: string;
    tags: string[];
}

export interface Rubro {
    id: string;
    name: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  rubros: string[];
  tasks: Partial<Task>[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface Snapshot {
    id: string;
    organizationId: string;
    projectId: string; // Added projectId
    name: string;
    date: string;
    description?: string;
    totalCost: number;
    items: BudgetItem[];
    materialsSnapshot: Material[];
    data?: any;
}

// --- BASE MAESTRA DE TAREAS / APU (nivel organización, persistida en localStorage v1) ---
// Catálogo corporativo reutilizable de tareas con rendimientos estándar.
// Independiente de Task (nivel proyecto). Sin tocar ERPContext.

export interface MasterTaskMaterial {
  id: string;                    // crypto.randomUUID() — local
  masterMaterialId?: string;     // FK opcional a MasterMaterial (Supabase)
  materialName: string;          // snapshot del nombre (desacopla del online)
  unit: string;                  // snapshot de unidad
  quantity: number;              // cantidad por unidad de tarea
  wastePercent?: number;         // % desperdicio adicional
  lastKnownUnitPrice?: number;   // precio capturado al agregar línea — evita depender del online
  // Motor recursivo (migration 010)
  resourceId?: string;           // UUID del recurso en resources — fuente de costo versionado
  subMasterTaskId?: string;      // UUID de otro MasterTask — APU anidado (recursivo)
  conversionFactor?: number;     // factor unidad rendimiento → unidad base recurso (ej: bolsa 50kg → 50)
  commercialUnit?: string;       // etiqueta de la unidad comercial (ej: "bolsa 50 kg") — migration 017
}

export interface MasterTaskLabor {
  id: string;
  laborCategoryId: string;       // FK a LaborCategory (localStorage vía ERPContext)
  laborCategoryName: string;     // snapshot
  quantity: number;              // cantidad de trabajadores (ej: 1.0 oficial, 0.5 ayudante)
  // Motor recursivo (migration 010)
  resourceId?: string;           // UUID del recurso LABOR — tarifa actualizada por índice
  snapshotHourlyRate?: number;   // tarifa/h capturada al importar — fallback si sin resourceId
}

export interface MasterTaskEquipment {
  id: string;
  toolId: string;                // FK a Tool (localStorage vía ERPContext)
  toolName: string;              // snapshot
  hoursPerUnit: number;          // horas de uso por unidad de tarea (h/u)
  // Motor recursivo (migration 010)
  resourceId?: string;           // UUID del recurso EQUIPMENT — costo/h actualizado por índice
  snapshotCostPerHour?: number;  // costo/h capturado al importar — fallback si sin resourceId
}

export interface MasterTask {
  id: string;
  organizationId: string;
  code?: string;                 // "CAP-001"
  name: string;
  description?: string;
  unit: string;                  // "m2", "m3", "kg"
  category?: string;             // Rubro: "Mampostería", "Hormigón"
  dailyYield: number;            // u/día — DEBE ser > 0 para calcular MO
  fixedCost?: number;            // costos fijos por unidad (fletes, subcontratos menores)
  fixedCostDescription?: string;
  specifications?: string;
  tags?: string[];
  isActive: boolean;             // soft delete
  materials: MasterTaskMaterial[];
  labor: MasterTaskLabor[];
  equipment: MasterTaskEquipment[];
  /** Metadatos de origen cuando el APU fue generado automáticamente (ej: calculadora Chandías) */
  sourceMetadata?: APUSourceMetadata;
  createdAt: string;             // ISO timestamp
  updatedAt: string;
}

/**
 * Metadatos de trazabilidad para APUs generados automáticamente.
 * Guardado en master_tasks.source_metadata (JSONB).
 * Migración: 037_apu_source_metadata.sql
 */
export interface APUSourceMetadata {
  /** Identificador del proceso generador */
  source: 'chandias_computation' | string;
  /** ID de la tarea del catálogo Chandías que originó este APU */
  catalogTaskId?: string;
  catalogTaskName?: string;
  catalogTaskUnit?: string;
  /** Cantidad total acumulada de los ítems que generaron este APU */
  totalQuantity?: number;
  itemCount?: number;
  /** Diámetro de barra de acero si aplica (mm) */
  steelDiameterMm?: number;
  /** Snapshot de los ítems de entrada al momento de la generación */
  inputItems?: Array<{
    itemId: string;
    dims: Record<string, number>;
    quantity: number;
    description?: string;
  }>;
  /** Fecha de generación (YYYY-MM-DD) */
  snapshotDate?: string;
}

// --- BASE MAESTRA DE MATERIALES (nivel organización, persistida en Supabase) ---
// Separada de Material (nivel proyecto en localStorage).
// organization_id es text para compatibilidad con los IDs de la app actual (ej: 'org_a').
export interface MasterMaterial {
  id: string;              // UUID generado por Supabase
  organizationId: string;  // Mapea a organization_id en DB
  code?: string;           // Código interno: "MAT-0001"
  name: string;
  description?: string;
  unit: string;            // "kg", "m3", "bolsa"
  unitPrice: number;       // Precio unitario actual
  currency: string;        // "ARS" | "USD"
  category?: string;       // "Cemento", "Hierros", "Sanitarios"
  supplier?: string;       // Proveedor habitual
  commercialFormat?: string; // "Bolsa 50kg", "Barra 12m"
  wastePercent?: number;   // % desperdicio estándar
  commercialUnit?: string;    // Etiqueta unidad de compra. Ej: "bolsa 50 kg" (migration 021)
  conversionFactor?: number;  // 1 unidad comercial = N unidades técnicas (migration 021)
  isActive: boolean;       // Soft delete
  lastPriceUpdate?: string; // ISO timestamp
  createdAt?: string;
  updatedAt?: string;
}

export interface UnitPriceAnalysis {
    taskId?: string;
    materialCost: number;
    laborCost: number;
    toolCost: number;
    fixedCost: number;
    totalUnitCost: number;
    materials?: any[];
    labor?: any[];
    tools?: any[];
}

// --- PLANTILLAS DE PRESUPUESTO ---
// Agrupación reutilizable de MasterTask con cantidades predefinidas.
// Independiente de ERPContext, persistida en localStorage.

export interface BudgetTemplateItem {
  masterTaskId: string;
  quantity?: number;    // cantidad default al aplicar la plantilla
  sortOrder: number;
}

export interface BudgetTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  category?: string;    // rubro principal o etiqueta libre
  items: BudgetTemplateItem[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Supabase Auth — tipos organizacionales ───────────────────────────────────

/** Roles tal como están definidos en la tabla organization_members (DB real) */
export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Organization {
  id: string;           // UUID
  name: string;
  slug?: string;
  createdAt?: string;
}

/**
 * Perfil del usuario en public.profiles.
 * Columnas reales: id, full_name, email, default_organization_id, created_at.
 * email se sincroniza desde auth.users vía trigger.
 */
export interface Profile {
  id: string;           // mismo UUID que auth.users.id
  fullName?: string;
  email?: string;       // snapshot sincronizado desde auth.users
  defaultOrganizationId?: string; // UUID — org activa por defecto
  createdAt?: string;
  systemRole?: SystemRole; // Sistema de roles global (migration 048)
}

/** Membresía de un usuario en una organización */
export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgRole;        // valores reales del DB: owner | admin | editor | viewer
  organization?: Organization; // join eager
  // Campos enriquecidos (join a profiles) — disponibles via listOrgMembers
  fullName?: string;
  email?: string;
}

// ─── Motor de costos recursivo ────────────────────────────────────────────────

/** Recurso del catálogo (global o de organización). Tabla: public.resources */
export interface Resource {
  id: string;                   // UUID
  catalogId?: string;           // FK a public.catalogs
  organizationId?: string;      // UUID — null = global
  code?: string;
  name: string;
  unit: string;                 // unidad base: "KG", "M3", "HS", etc.
  type: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'SUBCONTRACT';
  baseCost: number;             // costo de referencia / fallback sin snapshot
  socialChargesPct?: number;    // % cargas sociales (informativo, no usado por fórmula)
  isActive: boolean;
  pricingNotes?: string;
  currentSnapshotId?: string;   // UUID — caché del snapshot vigente HOY
  categoryName?: string;        // category_name — familia/categoría del recurso
}

/** Resultado de calcular el costo unitario de un MasterTask con el motor recursivo */
export interface RecursiveAPUResult {
  materialCost:  number;
  laborCost:     number;
  equipmentCost: number;
  fixedCost:     number;
  totalUnitCost: number;
  warnings?: string[]; // avisos de conversión, recursos huérfanos, fallbacks usados
}

/** Contexto de ejecución del motor recursivo. Se crea una vez por recálculo. */
export interface RecursiveEngineContext {
  organizationId: string;         // UUID de organizations — DEBE ser UUID real, no ID legacy
  costDate:       string;         // YYYY-MM-DD — fecha para resolver snapshot de costo
  tasksMap:       Map<string, MasterTask>;  // masterTaskId → MasterTask
  resourcesMap?:  Map<string, Resource>;   // resourceId → Resource (para conversión de unidades)
  resolveCost:    (resourceId: string) => Promise<number | null>; // inyectable — facilita testing
  visited:        Set<string>;    // cycle detection: IDs de MasterTask en el call stack actual
  computed:       Map<string, RecursiveAPUResult>; // memoización: masterTaskId → resultado
}

/** Costo calculado de un ítem del presupuesto */
export interface BudgetItemCost {
  budgetItemId:  string;
  taskId:        string;          // Task.id (nivel proyecto)
  masterTaskId?: string;          // MasterTask.id
  unitCost:      RecursiveAPUResult;
  quantity:      number;
  totalCost:     number;          // unitCost.totalUnitCost * quantity
}

/** Resultado completo del recálculo de un presupuesto con una base de costos */
export interface BudgetCostResult {
  projectId:       string;
  costBase:        string;        // YYYY-MM-DD último día del mes
  items:           BudgetItemCost[];
  totalDirectCost: number;        // suma de todos los totalCost
  computedAt:      string;        // ISO timestamp del cálculo
}

// --- CALCULADORA DE MATERIALES (estado local, sin persistencia) ---

export interface CalcItem {
  id: string;            // crypto.randomUUID() — local state only
  masterTaskId: string;
  quantity: number;
}

export interface ResourceLine {
  key: string;           // dedup key: masterMaterialId | name.toLowerCase()
  name: string;
  unit: string;
  quantityPerUnit: number; // rendimiento por unidad de APU (ya con waste)
  totalQuantity: number;   // quantityPerUnit × item.quantity — en unidad TÉCNICA (kg, m3, …)
  unitPrice: number;
  totalCost: number;
  wastePercent: number;
  sourceTaskId: string;
  sourceTaskName: string;
  /** Factor: 1 unidad comercial = N unidades técnicas. Fórmula compra: CEIL(totalQuantity / cf) */
  conversionFactor?: number;
  /** Etiqueta de la unidad de compra. Ej: "bolsa 50 kg". Solo si conversionFactor está definido. */
  commercialUnit?: string;
}

export interface APUCalcResult {
  masterTaskId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCosts: { material: number; labor: number; equipment: number; fixed: number; total: number };
  resources: { materials: ResourceLine[]; labor: ResourceLine[]; equipment: ResourceLine[] };
}

export interface AggregatedResourceLine {
  key: string;
  name: string;
  unit: string;
  totalQuantity: number;
  unitPrice: number;
  totalCost: number;
  sources: string[];
  /** Factor: 1 unidad comercial = N unidades técnicas. Fórmula: CEIL(totalQuantity / cf) */
  conversionFactor?: number;
  /** Etiqueta de la unidad de compra. Ej: "bolsa 50 kg". Solo si conversionFactor está definido. */
  commercialUnit?: string;
}

export interface MaterialsCalculationResult {
  apuResults: APUCalcResult[];
  aggregated: {
    materials: AggregatedResourceLine[];
    labor: AggregatedResourceLine[];
    equipment: AggregatedResourceLine[];
  };
  totals: { material: number; labor: number; equipment: number; fixed: number; total: number };
}

// --- RPC CALCULADORA CONSOLIDADA (server-side, sin persistencia) ---
// Shapes de request/response de la RPC calculate_consolidated_resources.

export interface RpcConsolidatedRequest {
  items: Array<{ masterTaskId: string; quantity: number }>;
  organizationId: string;
  /** YYYY-MM-DD. Defaults a today. Preparado para resource_cost_snapshots. */
  costDate?: string;
}

/** Una línea de recurso consolidada (cross-APU) devuelta por la RPC. */
export interface RpcResourceLine {
  /** UUID de master_material | labor_category_id | tool_id | clave de dedup por nombre */
  resourceId: string;
  code: string;
  name: string;
  unit: string;
  totalQuantity: number;
  /** Costo unitario promedio ponderado: totalCost / totalQuantity */
  unitCost: number;
  totalCost: number;
  sourceTaskNames: string[];
  // ── Conversión comercial (migration 017) ──────────────────────────────
  /** Factor 1 unidad comercial = N unidades técnicas. Null si no aplica. */
  conversionFactor?: number;
  /** Etiqueta de la unidad de compra. Ej: "bolsa 50 kg". Null si no aplica. */
  commercialUnit?: string;
  /** Cantidad a comprar = CEIL(totalQuantity / conversionFactor). Null si no aplica. */
  purchaseQuantity?: number;
}

/** Resumen de costo unitario por APU (para el tab "Por APU"). */
export interface RpcAPUSummary {
  masterTaskId: string;
  name: string;
  requestedQty: number;
  unitCosts: {
    material: number;
    labor: number;
    equipment: number;
    total: number;
  };
}

// ─── REPORTE TÉCNICO POR APU (get_apu_technical_report) ──────────────────────

/** Origen del costo mostrado en cada línea del reporte */
export type APUReportCostSource = 'SNAPSHOT' | 'RESOURCE_BASE' | 'LEGACY_PRICE' | 'FIXED';

/**
 * Una línea de recurso en el reporte técnico de APU.
 * Aplica a materiales, MO, equipos, subcontratos y costo fijo.
 */
export interface APUReportLine {
  id: string;
  resourceType: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'SUBCONTRACT' | 'FIXED';
  resourceCode?: string;
  resourceName: string;
  unit: string;
  /** Cantidad comercial (MAT), operarios (LABOR PATH A), HM/u (EQUIP), HH/u (LABOR PATH B) */
  quantity: number;
  /** Factor de conversión unidad comercial → unidad base. 1 si no aplica. */
  conversionFactor: number;
  wastePercent: number;
  /** Operarios (solo LABOR PATH A) */
  workers?: number;
  /** HH/u=(workers×9h)/rendimiento para LABOR PATH A; HM/u para EQUIP; HH/u directo en PATH B */
  hoursPerUnit?: number;
  /** Tarifa base antes de cargas sociales (LABOR) o precio por unidad base (MAT/EQUIP) */
  baseCost: number;
  /** Cargas sociales + seguro % (solo LABOR cuando hay join a labor_categories) */
  socialChargesPct?: number;
  /** baseCost × conv_factor (MAT) | baseCost × (1 + charges/100) (LABOR) | baseCost (EQUIP) */
  effectiveUnitCost: number;
  /** Aporte al costo unitario del APU = effectiveUnitCost × cantidad × factores */
  contribution: number;
  costSource: APUReportCostSource;
  note?: string;
}

export interface APUTechnicalReport {
  masterTaskId: string;
  code?: string;
  name: string;
  unit: string;
  category?: string;
  description?: string;
  specifications?: string;
  dailyYield: number;
  workdayHours: number;      // constante = 9h
  fixedCost: number;
  fixedCostDescription?: string;
  /** true = PATH A (master_task_materials/labor/equipment); false = PATH B (catalog_task_yields) */
  isPathA: boolean;
  costDate: string;          // YYYY-MM-DD
  lines: APUReportLine[];
  subtotals: {
    material:    number;
    labor:       number;
    equipment:   number;
    subcontract: number;
    fixed:       number;
  };
  totalDirectCost: number;
  computedAt: string;        // ISO timestamp UTC
}

/** Resultado completo devuelto por la RPC. */
export interface RpcConsolidatedResult {
  materials: RpcResourceLine[];
  labor: RpcResourceLine[];
  equipment: RpcResourceLine[];
  apuSummary: RpcAPUSummary[];
  totals: {
    material: number;
    labor: number;
    equipment: number;
    grandTotal: number;
  };
  computedAt: string; // ISO timestamp UTC
}

// ─── BUDGET COST SNAPSHOTS (migration 018) ───────────────────────────────────

/** Fila de budget_cost_snapshots desnormalizada (vista v_budget_snapshot_summary). */
export interface BudgetCostSnapshot {
  id: string;
  projectId: string;
  organizationId: string;
  costDate: string;               // YYYY-MM-DD
  computedAt: string;             // ISO timestamp UTC
  createdBy?: string;             // UUID usuario
  itemCount: number;
  grandTotal: number;
  totalMaterial: number;
  totalLabor: number;
  totalEquipment: number;
}

/** Resultado completo de snapshot_budget_costs RPC. */
export interface BudgetCostSnapshotResult {
  snapshotId: string;
  projectId: string;
  costDate: string;
  itemCount: number;
  totals: {
    material: number;
    labor: number;
    equipment: number;
    grandTotal: number;
  };
  computedAt: string;
  error?: string;
}

/** Resultado de get_budget_cost_staleness RPC. */
export interface BudgetCostStaleness {
  /** null = nunca calculado */
  isStale: boolean | null;
  neverCalculated: boolean;
  lastSnapshotAt: string | null;
  lastSnapshotCostDate: string | null;
  lastSnapshotTotals: { material: number; labor: number; equipment: number; grandTotal: number } | null;
  staleCount: number;
  staleResources: Array<{
    materialId: string;
    materialName: string;
    updatedAt: string;
  }>;
}

/** Input de get_budget_for_calculator RPC. */
export interface BudgetForCalculatorItem {
  master_task_id: string;
  quantity: number;
  taskName: string;
  itemCount: number;
}

/** Resultado de get_budget_for_calculator RPC. */
export interface BudgetForCalculatorResult {
  items: BudgetForCalculatorItem[];
  itemsWithoutMaster: number;
  projectId: string;
}

/** Resultado de detect_duplicate_apu_codes RPC. */
export interface DuplicateAPUCodesResult {
  duplicatesByCode: Array<{
    code: string;
    count: number;
    tasks: Array<{ id: string; name: string; code: string; isActive: boolean }>;
  }>;
  duplicatesByName: Array<{
    name: string;
    count: number;
    tasks: Array<{ id: string; name: string; code: string | null; isActive: boolean }>;
  }>;
  checkedAt: string;
}
