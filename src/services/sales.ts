import { supabase } from './supabase';
import { Sale, SaleType } from '../types';
import { addOneLocalCalendarDayYmd } from '../utils/statsPeriod';

type SalesRow = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  sale_date: string;
  sale_type: SaleType;
  quantity: number;
  unit_price?: number | null;
  price_per_unit?: number | null;
  total_price: number;
  notes?: string | null;
  is_paid?: boolean | null;
  created_at: string;
  customers?: { name?: string | null } | null;
};

const SALE_SELECT =
  'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, price_per_unit, total_price, notes, is_paid, created_at, customers(name)';

/** Algunas BDs tienen unit_price, otras price_per_unit, o ambas (legacy). */
function unitPriceFromRow(row: SalesRow): number {
  const a = row.unit_price;
  const b = row.price_per_unit;
  if (a != null && Number.isFinite(Number(a))) return Number(a);
  if (b != null && Number.isFinite(Number(b))) return Number(b);
  return 0;
}

function toSale(row: SalesRow): Sale {
  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    customer_name: row.customers?.name || '',
    date: row.sale_date,
    type: row.sale_type,
    quantity: row.quantity,
    price_per_unit: unitPriceFromRow(row),
    total_price: row.total_price,
    notes: row.notes || '',
    is_paid: row.is_paid !== false,
    created_at: row.created_at,
  };
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return e.code === 'PGRST204' && String(e.message || '').includes(`'${column}'`);
}

/** Escribe ambas columnas cuando existen (evita NOT NULL en price_per_unit legacy). */
function pricePayload(pricePerUnit: number) {
  return {
    unit_price: pricePerUnit,
    price_per_unit: pricePerUnit,
  };
}

export const salesService = {
  async getAll(organizationId: string, daysBack = 30): Promise<Sale[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    let { data, error } = await supabase
      .from('sales')
      .select(SALE_SELECT)
      .eq('organization_id', organizationId)
      .gte('sale_date', fromDateStr)
      .order('sale_date', { ascending: false });

    if (isMissingColumnError(error, 'price_per_unit')) {
      const retry = await supabase
        .from('sales')
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, is_paid, created_at, customers(name)'
        )
        .eq('organization_id', organizationId)
        .gte('sale_date', fromDateStr)
        .order('sale_date', { ascending: false });
      data = retry.data;
      error = retry.error;
    } else if (isMissingColumnError(error, 'unit_price')) {
      const retry = await supabase
        .from('sales')
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, price_per_unit, total_price, notes, is_paid, created_at, customers(name)'
        )
        .eq('organization_id', organizationId)
        .gte('sale_date', fromDateStr)
        .order('sale_date', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return (data || []).map((row) => toSale(row as SalesRow));
  },

  async getAllRange(organizationId: string, fromDate: string, toDate: string): Promise<Sale[]> {
    const toExclusive = addOneLocalCalendarDayYmd(toDate);
    let { data, error } = await supabase
      .from('sales')
      .select(SALE_SELECT)
      .eq('organization_id', organizationId)
      .gte('sale_date', fromDate)
      .lt('sale_date', toExclusive)
      .order('sale_date', { ascending: false });

    if (isMissingColumnError(error, 'price_per_unit')) {
      const retry = await supabase
        .from('sales')
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, is_paid, created_at, customers(name)'
        )
        .eq('organization_id', organizationId)
        .gte('sale_date', fromDate)
        .lt('sale_date', toExclusive)
        .order('sale_date', { ascending: false });
      data = retry.data;
      error = retry.error;
    } else if (isMissingColumnError(error, 'unit_price')) {
      const retry = await supabase
        .from('sales')
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, price_per_unit, total_price, notes, is_paid, created_at, customers(name)'
        )
        .eq('organization_id', organizationId)
        .gte('sale_date', fromDate)
        .lt('sale_date', toExclusive)
        .order('sale_date', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return (data || []).map((row) => toSale(row as SalesRow));
  },

  async create(
    organizationId: string,
    date: string,
    customerId: string,
    type: SaleType,
    quantity: number,
    pricePerUnit: number,
    notes?: string,
    isPaid = true
  ): Promise<Sale> {
    const totalPrice = quantity * pricePerUnit;
    const base = {
      organization_id: organizationId,
      customer_id: customerId || null,
      sale_date: date,
      sale_type: type,
      quantity,
      total_price: totalPrice,
      notes: notes || '',
      is_paid: isPaid,
      ...pricePayload(pricePerUnit),
    };

    let { data, error } = await supabase
      .from('sales')
      .insert(base)
      .select(SALE_SELECT)
      .single();

    if (isMissingColumnError(error, 'price_per_unit')) {
      const { price_per_unit: _p, ...withoutLegacy } = base;
      const retry = await supabase
        .from('sales')
        .insert(withoutLegacy)
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, is_paid, created_at, customers(name)'
        )
        .single();
      data = retry.data;
      error = retry.error;
    } else if (isMissingColumnError(error, 'unit_price')) {
      const { unit_price: _u, ...withoutUnit } = base;
      const retry = await supabase
        .from('sales')
        .insert(withoutUnit)
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, price_per_unit, total_price, notes, is_paid, created_at, customers(name)'
        )
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return toSale(data as SalesRow);
  },

  async update(
    organizationId: string,
    id: string,
    date: string,
    customerId: string,
    type: SaleType,
    quantity: number,
    pricePerUnit: number,
    notes?: string,
    isPaid = true
  ): Promise<Sale> {
    const totalPrice = quantity * pricePerUnit;
    const base = {
      sale_date: date,
      customer_id: customerId || null,
      sale_type: type,
      quantity,
      total_price: totalPrice,
      notes: notes || '',
      is_paid: isPaid,
      ...pricePayload(pricePerUnit),
    };

    let { data, error } = await supabase
      .from('sales')
      .update(base)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select(SALE_SELECT)
      .single();

    if (isMissingColumnError(error, 'price_per_unit')) {
      const { price_per_unit: _p, ...withoutLegacy } = base;
      const retry = await supabase
        .from('sales')
        .update(withoutLegacy)
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, is_paid, created_at, customers(name)'
        )
        .single();
      data = retry.data;
      error = retry.error;
    } else if (isMissingColumnError(error, 'unit_price')) {
      const { unit_price: _u, ...withoutUnit } = base;
      const retry = await supabase
        .from('sales')
        .update(withoutUnit)
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, price_per_unit, total_price, notes, is_paid, created_at, customers(name)'
        )
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return toSale(data as SalesRow);
  },

  async getUnpaid(organizationId: string): Promise<Sale[]> {
    let { data, error } = await supabase
      .from('sales')
      .select(SALE_SELECT)
      .eq('organization_id', organizationId)
      .eq('is_paid', false)
      .order('sale_date', { ascending: false });

    if (isMissingColumnError(error, 'price_per_unit')) {
      const retry = await supabase
        .from('sales')
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, is_paid, created_at, customers(name)'
        )
        .eq('organization_id', organizationId)
        .eq('is_paid', false)
        .order('sale_date', { ascending: false });
      data = retry.data;
      error = retry.error;
    } else if (isMissingColumnError(error, 'unit_price')) {
      const retry = await supabase
        .from('sales')
        .select(
          'id, organization_id, customer_id, sale_date, sale_type, quantity, price_per_unit, total_price, notes, is_paid, created_at, customers(name)'
        )
        .eq('organization_id', organizationId)
        .eq('is_paid', false)
        .order('sale_date', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return (data || []).map((row) => toSale(row as SalesRow));
  },

  async setPaid(organizationId: string, id: string, isPaid: boolean): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .update({ is_paid: isPaid })
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },
};
