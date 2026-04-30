export interface Gallinero {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  capacity: number;
  current_count: number;
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export interface Sale {
  id: string;
  organization_id: string;
  customer_id?: string | null;
  customer_name?: string;
  date: string;
  type: 'maple' | 'docena' | 'media_docena';
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

export interface Expense {
  id: string;
  organization_id: string;
  date: string;
  description: string;
  quantity_kg: number;
  total_price: number;
  created_at: string;
}

export interface FeedLog {
  id: string;
  organization_id: string;
  gallinero_id: string;
  date: string;
  kg_opened: number;
  created_at: string;
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
