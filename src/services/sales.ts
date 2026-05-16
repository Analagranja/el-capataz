import { supabase } from './supabase';
import { Sale } from '../types';
import { addOneLocalCalendarDayYmd } from '../utils/statsPeriod';

type SaleType = 'maple' | 'docena' | 'media_docena';

type SalesRow = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  sale_date: string;
  sale_type: SaleType;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string | null;
  created_at: string;
  customers?: { name?: string | null } | null;
};

function toSale(row: SalesRow): Sale {
  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    customer_name: row.customers?.name || '',
    date: row.sale_date,
    type: row.sale_type,
    quantity: row.quantity,
    price_per_unit: row.unit_price,
    total_price: row.total_price,
    notes: row.notes || '',
    created_at: row.created_at,
  };
}

export const salesService = {
  async getAll(organizationId: string, daysBack = 30): Promise<Sale[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('sales')
      .select('id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, created_at, customers(name)')
      .eq('organization_id', organizationId)
      .gte('sale_date', fromDateStr)
      .order('sale_date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => toSale(row as SalesRow));
  },

  async getAllRange(organizationId: string, fromDate: string, toDate: string): Promise<Sale[]> {
    const toExclusive = addOneLocalCalendarDayYmd(toDate);
    const { data, error } = await supabase
      .from('sales')
      .select('id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, created_at, customers(name)')
      .eq('organization_id', organizationId)
      .gte('sale_date', fromDate)
      .lt('sale_date', toExclusive)
      .order('sale_date', { ascending: false });

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
    notes?: string
  ): Promise<Sale> {
    const totalPrice = quantity * pricePerUnit;
    const { data, error } = await supabase
      .from('sales')
      .insert({
        organization_id: organizationId,
        customer_id: customerId || null,
        sale_date: date,
        sale_type: type,
        quantity,
        unit_price: pricePerUnit,
        total_price: totalPrice,
        notes: notes || '',
      })
      .select('id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, created_at, customers(name)')
      .single();

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
    notes?: string
  ): Promise<Sale> {
    const totalPrice = quantity * pricePerUnit;
    const { data, error } = await supabase
      .from('sales')
      .update({
        sale_date: date,
        customer_id: customerId || null,
        sale_type: type,
        quantity,
        unit_price: pricePerUnit,
        total_price: totalPrice,
        notes: notes || '',
      })
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select('id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, created_at, customers(name)')
      .single();

    if (error) throw error;
    return toSale(data as SalesRow);
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
