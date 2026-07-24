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
  gallinero_id?: string | null;
  /** Nombre del gallinero (join virtual, no columna en `expenses`) */
  gallinero_name?: string | null;
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
  | 'ventas'
  | 'clientes'
  | 'gastos'
  | 'eventos'
  | 'estadisticas'
  | 'configuracion';
