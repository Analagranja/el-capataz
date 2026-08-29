export interface GallineroFlock {
  id: string;
  organization_id: string;
  gallinero_id: string;
  name: string;
  current_count: number;
  status: 'active' | 'retired';
  birth_date?: string | null;
  breed?: string | null;
  feather_color?: string | null;
  average_weight_kg?: number | null;
  band_number?: string | null;
  band_color?: string | null;
  supplier?: string | null;
  notes_flock?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Gallinero {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  /** Capacidad máxima (columna legacy; puede no existir en todas las BD) */
  capacity?: number;
  /** Suma de `current_count` de camadas con status `active` */
  current_count: number;
  flocks?: GallineroFlock[];
  created_at: string;
  updated_at: string;
}

export interface MortalityLog {
  id: string;
  organization_id: string;
  gallinero_id: string;
  flock_id?: string | null;
  date: string;
  count: number;
  cause?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ProductionRecord {
  id: string;
  organization_id: string;
  gallinero_id: string;
  date: string;
  eggs_count: number;
  broken_dirty_eggs_count: number;
  /** Gallinas en el gallinero al guardar el registro (base fija para % postura) */
  poultry_count: number;
  laying_percentage: number;
  notes?: string;
  eggs_large?: number | null;
  eggs_medium?: number | null;
  eggs_small?: number | null;
  created_at: string;
}

export type SaleType =
  | 'maple'
  | 'docena'
  | 'media_docena'
  | 'pack15'
  | 'maple_grande'
  | 'maple_mediano'
  | 'maple_chico';

export interface Sale {
  id: string;
  organization_id: string;
  customer_id?: string | null;
  customer_name?: string;
  date: string;
  type: SaleType;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  notes?: string;
  created_at: string;
}

/** Valores guardados en DB (migración unifica vacuna→vacunacion, observacion→otros) */
export type EventType =
  | 'vacunacion'
  | 'ingreso_pollitas'
  | 'vitaminas'
  | 'medicacion'
  | 'muerte'
  | 'otros';

export interface Event {
  id: string;
  organization_id: string;
  gallinero_id: string;
  event_type: EventType;
  description: string;
  affected_count: number;
  date: string;
  created_at: string;
  /** Fecha de próxima aplicación (solo sanidad); null si no aplica */
  reminder_date?: string | null;
  /** Recordatorio de sanidad marcado como realizado */
  completed?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string | null;
  created_at: string;
}

/** Item de packaging trackeado en control físico (unidades, no kg). */
export type PackagingItemKey = 'maple' | 'docena' | 'media_docena';

export interface Expense {
  id: string;
  organization_id: string;
  date: string;
  description: string;
  quantity_kg: number;
  /** Bolsas compradas (Alimento por bolsas). Null si se cargó en kg. */
  bags_count?: number | null;
  /** Kg por bolsa al comprar (trazabilidad). */
  bag_weight_kg?: number | null;
  /** Unidades de packaging compradas (Maples / Packaging); independiente de quantity_kg. */
  packaging_quantity?: number | null;
  packaging_item_key?: PackagingItemKey | null;
  total_price: number;
  /**
   * Meses de prorrateo para el reporte de costo (Estadísticas).
   * Default 1. Solo aplica a gastos que no son Alimento ni Maples / Packaging.
   */
  amortization_months?: number;
  gallinero_id?: string | null;
  /** Nombre del gallinero (join virtual, no columna en `expenses`) */
  gallinero_name?: string | null;
  created_at: string;
}

export type InventoryCategory = 'eggs' | 'feed' | 'maples';

/** Apertura de packaging: stock físico declarado para resetear la línea base. */
export interface PackagingStockBaseline {
  id: string;
  organization_id: string;
  baseline_date: string;
  maple: number;
  docena: number;
  media_docena: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** Apertura de alimento: kg físicos declarados para resetear la línea base. */
export interface FeedStockBaseline {
  id: string;
  organization_id: string;
  baseline_date: string;
  stock_kg: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryCount {
  id: string;
  organization_id: string;
  category: InventoryCategory;
  item_key: string;
  counted_amount: number;
  theoretical_amount: number;
  difference: number;
  counted_at: string;
  created_by?: string | null;
  created_at: string;
}

export type FeedLogTipo = 'bolsas' | 'granel';

export interface FeedLog {
  id: string;
  organization_id: string;
  gallinero_id: string;
  date: string;
  kg_opened: number;
  tipo: FeedLogTipo;
  /** Solo si tipo === 'bolsas'; trazabilidad */
  cantidad_bolsas?: number | null;
  /** Solo si tipo === 'bolsas'; trazabilidad */
  kg_por_bolsa?: number | null;
  created_at: string;
}

export type RecriaFeedStage =
  | 'pre_iniciador'
  | 'iniciador'
  | 'crecimiento'
  | 'desarrollo'
  | 'pre_postura';

export type RecriaFlockStatus = 'active' | 'graduated' | 'retired';

export interface RecriaFlock {
  id: string;
  organization_id: string;
  name: string;
  status: RecriaFlockStatus;
  initial_count: number;
  current_count: number;
  breed?: string | null;
  supplier?: string | null;
  /** Fecha de nacimiento real; opcional si se desconoce. */
  birth_date?: string | null;
  /** Ingreso a la granja; siempre requerida. */
  entry_date: string;
  location_notes?: string | null;
  notes?: string | null;
  graduated_at?: string | null;
  graduated_gallinero_id?: string | null;
  graduated_flock_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecriaWeeklyFollowup {
  id: string;
  organization_id: string;
  recria_flock_id: string;
  week_start_date: string;
  average_weight_g?: number | null;
  mortality_count: number;
  mortality_reason?: string | null;
  feed_stage: RecriaFeedStage;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type RecriaEventType = 'vacunacion' | 'vitaminas' | 'medicacion' | 'otros';

export interface RecriaEvent {
  id: string;
  organization_id: string;
  recria_flock_id: string;
  event_type: RecriaEventType;
  description: string;
  affected_count: number;
  event_date: string;
  reminder_date?: string | null;
  completed: boolean;
  created_by?: string | null;
  created_at: string;
}

export interface FeedConsumptionMonthly {
  id: string;
  organization_id: string;
  gallinero_id: string | null;
  year: number;
  month: number;
  kg_consumed: number;
  notes: string | null;
  /** Aves al momento de declarar el consumo */
  hens_snapshot?: number | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'admin' | 'operator' | 'vendedor';

export type Page =
  | 'dashboard'
  | 'gallineros'
  | 'produccion'
  | 'recria'
  | 'ventas'
  | 'clientes'
  | 'gastos'
  | 'inventario'
  | 'eventos'
  | 'estadisticas'
  | 'configuracion';
