import { supabase } from './supabase';
import type { EggReservation, EggReservationStatus, SaleType } from '../types';

const SELECT =
  'id, organization_id, customer_id, sale_type, quantity, delivery_date, status, converted_sale_id, notes, created_by, created_at, updated_at, customers(name)';

type ReservationRow = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  sale_type: SaleType;
  quantity: number;
  delivery_date: string | null;
  status: EggReservationStatus;
  converted_sale_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: { name: string } | { name: string }[] | null;
};

function customerName(row: ReservationRow): string | undefined {
  const c = row.customers;
  if (!c) return undefined;
  if (Array.isArray(c)) return c[0]?.name;
  return c.name;
}

function toReservation(row: ReservationRow): EggReservation {
  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    customer_name: customerName(row),
    sale_type: row.sale_type,
    quantity: Number(row.quantity) || 0,
    delivery_date: row.delivery_date ? String(row.delivery_date).slice(0, 10) : null,
    status: row.status,
    converted_sale_id: row.converted_sale_id,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const eggReservationsService = {
  async listPending(organizationId: string): Promise<EggReservation[]> {
    const { data, error } = await supabase
      .from('egg_reservations')
      .select(SELECT)
      .eq('organization_id', organizationId)
      .eq('status', 'pendiente')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => toReservation(row as ReservationRow));
  },

  async create(
    organizationId: string,
    createdBy: string | null,
    input: {
      customerId: string;
      saleType: SaleType;
      quantity: number;
      deliveryDate: string;
      notes: string;
    }
  ): Promise<EggReservation> {
    const quantity = Math.floor(Number(input.quantity) || 0);
    if (quantity < 1) throw new Error('La cantidad tiene que ser al menos 1.');
    const delivery_date = String(input.deliveryDate || '').slice(0, 10);
    const payload = {
      organization_id: organizationId,
      customer_id: input.customerId || null,
      sale_type: input.saleType,
      quantity,
      delivery_date: /^\d{4}-\d{2}-\d{2}$/.test(delivery_date) ? delivery_date : null,
      status: 'pendiente' as const,
      notes: input.notes.trim() || null,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('egg_reservations')
      .insert(payload)
      .select(SELECT)
      .single();
    if (error) throw error;
    return toReservation(data as ReservationRow);
  },

  async updateStatus(
    organizationId: string,
    id: string,
    status: EggReservationStatus,
    convertedSaleId?: string | null
  ): Promise<EggReservation> {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (convertedSaleId !== undefined) {
      patch.converted_sale_id = convertedSaleId;
    }
    const { data, error } = await supabase
      .from('egg_reservations')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return toReservation(data as ReservationRow);
  },
};
