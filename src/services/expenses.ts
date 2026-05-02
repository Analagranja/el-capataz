import { supabase } from './supabase';
import { Expense } from '../types';

function mapExpenseRow(row: Record<string, unknown>): Expense {
  const expenseDate =
    (row.expense_date as string | undefined) ?? (row.date as string | undefined) ?? '';
  const qty =
    row.quantity_kg != null
      ? Number(row.quantity_kg)
      : row.quantity != null
        ? Number(row.quantity)
        : 0;
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    date: expenseDate,
    description: (row.description as string) ?? '',
    quantity_kg: qty,
    total_price: Number(row.total_price ?? 0),
    created_at: row.created_at as string,
  };
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return e.code === 'PGRST204' && String(e.message || '').includes(`'${column}'`);
}

export const expensesService = {
  async getAll(organizationId: string, daysBack = 60): Promise<Expense[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('expense_date', fromDateStr)
      .order('expense_date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => mapExpenseRow(row as Record<string, unknown>));
  },

  /** Gastos de la organización entre dos fechas (YYYY-MM-DD), por `expense_date`. */
  async getAllRange(organizationId: string, fromDate: string, toDate: string): Promise<Expense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('expense_date', fromDate)
      .lte('expense_date', toDate)
      .order('expense_date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => mapExpenseRow(row as Record<string, unknown>));
  },

  async create(
    organizationId: string,
    date: string,
    description: string,
    quantityKg: number,
    totalPrice: number
  ): Promise<Expense> {
    const base = {
      organization_id: organizationId,
      expense_date: date,
      description,
      total_price: totalPrice,
    };

    // Intentamos primero con "quantity" para compatibilidad con el esquema actual.
    let { data, error } = await supabase
      .from('expenses')
      .insert({ ...base, quantity: quantityKg })
      .select()
      .single();

    if (isMissingColumnError(error, 'quantity')) {
      const retry = await supabase
        .from('expenses')
        .insert({ ...base, quantity_kg: quantityKg })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return mapExpenseRow(data as Record<string, unknown>);
  },

  async update(
    organizationId: string,
    id: string,
    date: string,
    description: string,
    quantityKg: number,
    totalPrice: number
  ): Promise<Expense> {
    const base = {
      expense_date: date,
      description,
      total_price: totalPrice,
    };

    let { data, error } = await supabase
      .from('expenses')
      .update({ ...base, quantity_kg: quantityKg })
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select()
      .single();

    if (isMissingColumnError(error, 'quantity_kg')) {
      const retry = await supabase
        .from('expenses')
        .update({ ...base, quantity: quantityKg })
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return mapExpenseRow(data as Record<string, unknown>);
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },
};
