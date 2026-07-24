import { supabase } from './supabase';
import { Expense, PackagingItemKey } from '../types';
import { addOneLocalCalendarDayYmd } from '../utils/statsPeriod';
import {
  expenseQuantityWritePayload,
  resolveExpenseQuantityKg,
} from './expenseQuantity';

const EXPENSE_SELECT = '*, gallineros(name)';
/** Fallback sin join ni columnas opcionales nuevas. */
const EXPENSE_SELECT_CORE =
  'id, organization_id, expense_date, description, quantity_kg, total_price, gallinero_id, created_at';
const EXPENSE_SELECT_CORE_WITH_QUANTITY =
  'id, organization_id, expense_date, description, quantity_kg, quantity, total_price, gallinero_id, created_at';

export type ExpensePackagingFields = {
  packaging_quantity?: number | null;
  packaging_item_key?: PackagingItemKey | null;
};

export type ExpenseBagsFields = {
  bags_count?: number | null;
  bag_weight_kg?: number | null;
};

function gallineroNameFromRow(row: Record<string, unknown>): string | null {
  const rel = row.gallineros;
  if (!rel || typeof rel !== 'object') return null;
  if (Array.isArray(rel)) {
    const first = rel[0] as { name?: string } | undefined;
    return first?.name?.trim() || null;
  }
  return String((rel as { name?: string }).name ?? '').trim() || null;
}

function normalizePackagingItemKey(raw: unknown): PackagingItemKey | null {
  if (raw === 'maple' || raw === 'docena' || raw === 'media_docena') return raw;
  return null;
}

function mapExpenseRow(row: Record<string, unknown>): Expense {
  const expenseDate =
    (row.expense_date as string | undefined) ?? (row.date as string | undefined) ?? '';
  const gallineroIdRaw = row.gallinero_id;
  const packagingQtyRaw = row.packaging_quantity;
  const bagsRaw = row.bags_count;
  const bagWeightRaw = row.bag_weight_kg;
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    date: expenseDate,
    description: (row.description as string) ?? '',
    quantity_kg: resolveExpenseQuantityKg(row),
    bags_count:
      bagsRaw === null || bagsRaw === undefined
        ? null
        : Number.isFinite(Number(bagsRaw))
          ? Math.floor(Number(bagsRaw))
          : null,
    bag_weight_kg:
      bagWeightRaw === null || bagWeightRaw === undefined
        ? null
        : Number.isFinite(Number(bagWeightRaw))
          ? Number(bagWeightRaw)
          : null,
    packaging_quantity:
      packagingQtyRaw === null || packagingQtyRaw === undefined
        ? null
        : Number(packagingQtyRaw),
    packaging_item_key: normalizePackagingItemKey(row.packaging_item_key),
    total_price: Number(row.total_price ?? 0),
    gallinero_id:
      gallineroIdRaw === null || gallineroIdRaw === undefined
        ? null
        : String(gallineroIdRaw),
    gallinero_name: gallineroNameFromRow(row),
    created_at: row.created_at as string,
  };
}

/** Solo incluye keys de packaging cuando se pasan; en Alimento no las manda. */
function packagingPayload(
  packaging?: ExpensePackagingFields
): Partial<{ packaging_quantity: number | null; packaging_item_key: PackagingItemKey | null }> {
  if (!packaging) return {};
  const qty = packaging.packaging_quantity;
  const key = packaging.packaging_item_key ?? null;
  if (qty == null || !Number.isFinite(qty) || qty <= 0 || !key) {
    return { packaging_quantity: null, packaging_item_key: null };
  }
  return {
    packaging_quantity: Math.floor(qty),
    packaging_item_key: key,
  };
}

/** undefined = no tocar columnas; null/0 = limpiar; >0 = guardar bolsas. */
function bagsPayload(
  bags?: ExpenseBagsFields | null
): Partial<{ bags_count: number | null; bag_weight_kg: number | null }> {
  if (bags === undefined) return {};
  const count = bags?.bags_count != null ? Number(bags.bags_count) : NaN;
  if (!Number.isFinite(count) || count <= 0) {
    return { bags_count: null, bag_weight_kg: null };
  }
  const weight = bags?.bag_weight_kg != null ? Number(bags.bag_weight_kg) : NaN;
  return {
    bags_count: Math.floor(count),
    bag_weight_kg: Number.isFinite(weight) && weight > 0 ? weight : null,
  };
}

function stripOptionalExpenseColumns<T extends Record<string, unknown>>(
  row: T,
  ...columns: string[]
): T {
  const next = { ...row };
  for (const col of columns) {
    delete next[col];
  }
  return next;
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return e.code === 'PGRST204' && String(e.message || '').includes(`'${column}'`);
}

function normalizeGallineroId(gallineroId?: string | null): string | null {
  const id = String(gallineroId ?? '').trim();
  return id.length > 0 ? id : null;
}

async function selectExpenses(
  organizationId: string,
  fromDate: string,
  toExclusive?: string
): Promise<Expense[]> {
  const run = async (select: string) => {
    let query = supabase
      .from('expenses')
      .select(select)
      .eq('organization_id', organizationId)
      .gte('expense_date', fromDate)
      .order('expense_date', { ascending: false });
    if (toExclusive) {
      query = query.lt('expense_date', toExclusive);
    }
    return query;
  };

  let { data, error } = await run(EXPENSE_SELECT);

  // Si falla el join o columnas nuevas, degradar el select sin vaciar el resultado.
  if (error) {
    const retryStar = await run('*');
    if (!retryStar.error) {
      data = retryStar.data;
      error = null;
    } else {
      const retryCore = await run(EXPENSE_SELECT_CORE_WITH_QUANTITY);
      if (!retryCore.error) {
        data = retryCore.data;
        error = null;
      } else if (isMissingColumnError(retryCore.error, 'quantity')) {
        const retryNoQty = await run(EXPENSE_SELECT_CORE);
        data = retryNoQty.data;
        error = retryNoQty.error;
      } else {
        error = retryCore.error;
      }
    }
  }

  if (error) throw error;
  return (data || []).map((row) => mapExpenseRow(row as Record<string, unknown>));
}

export const expensesService = {
  async getAll(organizationId: string, daysBack = 60): Promise<Expense[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split('T')[0];
    return selectExpenses(organizationId, fromDateStr);
  },

  /** Gastos de la organización entre dos fechas (YYYY-MM-DD), por `expense_date`. */
  async getAllRange(organizationId: string, fromDate: string, toDate: string): Promise<Expense[]> {
    const toExclusive = addOneLocalCalendarDayYmd(toDate);
    return selectExpenses(organizationId, fromDate, toExclusive);
  },

  async create(
    organizationId: string,
    date: string,
    description: string,
    quantityKg: number,
    totalPrice: number,
    gallineroId?: string | null,
    packaging?: ExpensePackagingFields,
    bags?: ExpenseBagsFields | null
  ): Promise<Expense> {
    const packagingFields = packagingPayload(packaging);
    const bagsFields = bagsPayload(bags);
    const qtyFields = expenseQuantityWritePayload(quantityKg);
    const base = {
      organization_id: organizationId,
      expense_date: date,
      description,
      total_price: totalPrice,
      gallinero_id: normalizeGallineroId(gallineroId ?? null),
      ...packagingFields,
      ...bagsFields,
    };

    let { data, error } = await supabase
      .from('expenses')
      .insert({ ...base, ...qtyFields })
      .select(EXPENSE_SELECT)
      .single();

    if (isMissingColumnError(error, 'quantity')) {
      const { quantity: _q, ...rest } = { ...base, ...qtyFields };
      const retry = await supabase
        .from('expenses')
        .insert({ ...rest, quantity_kg: quantityKg })
        .select(EXPENSE_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (isMissingColumnError(error, 'quantity_kg')) {
      const { quantity_kg: _qk, ...rest } = { ...base, ...qtyFields };
      const retry = await supabase
        .from('expenses')
        .insert({ ...rest, quantity: quantityKg })
        .select(EXPENSE_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (
      isMissingColumnError(error, 'packaging_quantity') ||
      isMissingColumnError(error, 'packaging_item_key')
    ) {
      const baseNoPackaging = stripOptionalExpenseColumns(
        { ...base },
        'packaging_quantity',
        'packaging_item_key'
      );
      const retry = await supabase
        .from('expenses')
        .insert({ ...baseNoPackaging, ...qtyFields })
        .select(EXPENSE_SELECT_CORE)
        .single();
      data = retry.data;
      error = retry.error;
      if (isMissingColumnError(error, 'quantity')) {
        const { quantity: _q, ...rest } = { ...baseNoPackaging, ...qtyFields };
        const retry2 = await supabase
          .from('expenses')
          .insert({ ...rest, quantity_kg: quantityKg })
          .select(EXPENSE_SELECT_CORE)
          .single();
        data = retry2.data;
        error = retry2.error;
      }
      if (isMissingColumnError(error, 'quantity_kg')) {
        const { quantity_kg: _qk, ...rest } = { ...baseNoPackaging, ...qtyFields };
        const retry2 = await supabase
          .from('expenses')
          .insert({ ...rest, quantity: quantityKg })
          .select(EXPENSE_SELECT_CORE)
          .single();
        data = retry2.data;
        error = retry2.error;
      }
    }

    if (isMissingColumnError(error, 'bags_count') || isMissingColumnError(error, 'bag_weight_kg')) {
      const baseNoBags = stripOptionalExpenseColumns({ ...base }, 'bags_count', 'bag_weight_kg');
      const retry = await supabase
        .from('expenses')
        .insert({ ...baseNoBags, ...qtyFields })
        .select(EXPENSE_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (isMissingColumnError(error, 'gallinero_id')) {
      const { gallinero_id: _g, ...baseNoGallinero } = base;
      const retry = await supabase
        .from('expenses')
        .insert({ ...baseNoGallinero, ...qtyFields })
        .select(EXPENSE_SELECT)
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
    totalPrice: number,
    gallineroId?: string | null,
    packaging?: ExpensePackagingFields,
    bags?: ExpenseBagsFields | null
  ): Promise<Expense> {
    const packagingFields = packagingPayload(packaging);
    const bagsFields = bagsPayload(bags);
    const qtyFields = expenseQuantityWritePayload(quantityKg);
    const base = {
      expense_date: date,
      description,
      total_price: totalPrice,
      gallinero_id: normalizeGallineroId(gallineroId ?? null),
      ...packagingFields,
      ...bagsFields,
    };

    let { data, error } = await supabase
      .from('expenses')
      .update({ ...base, ...qtyFields })
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select(EXPENSE_SELECT)
      .single();

    if (isMissingColumnError(error, 'quantity')) {
      const { quantity: _q, ...rest } = { ...base, ...qtyFields };
      const retry = await supabase
        .from('expenses')
        .update({ ...rest, quantity_kg: quantityKg })
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select(EXPENSE_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (isMissingColumnError(error, 'quantity_kg')) {
      const { quantity_kg: _qk, ...rest } = { ...base, ...qtyFields };
      const retry = await supabase
        .from('expenses')
        .update({ ...rest, quantity: quantityKg })
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select(EXPENSE_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (
      isMissingColumnError(error, 'packaging_quantity') ||
      isMissingColumnError(error, 'packaging_item_key')
    ) {
      const baseNoPackaging = stripOptionalExpenseColumns(
        { ...base },
        'packaging_quantity',
        'packaging_item_key'
      );
      const retry = await supabase
        .from('expenses')
        .update({ ...baseNoPackaging, ...qtyFields })
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select(EXPENSE_SELECT_CORE)
        .single();
      data = retry.data;
      error = retry.error;
      if (isMissingColumnError(error, 'quantity_kg')) {
        const { quantity_kg: _qk, ...rest } = { ...baseNoPackaging, ...qtyFields };
        const retry2 = await supabase
          .from('expenses')
          .update({ ...rest, quantity: quantityKg })
          .eq('organization_id', organizationId)
          .eq('id', id)
          .select(EXPENSE_SELECT_CORE)
          .single();
        data = retry2.data;
        error = retry2.error;
      }
    }

    if (isMissingColumnError(error, 'bags_count') || isMissingColumnError(error, 'bag_weight_kg')) {
      const baseNoBags = stripOptionalExpenseColumns({ ...base }, 'bags_count', 'bag_weight_kg');
      const retry = await supabase
        .from('expenses')
        .update({ ...baseNoBags, ...qtyFields })
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select(EXPENSE_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (isMissingColumnError(error, 'gallinero_id')) {
      const { gallinero_id: _g, ...baseNoGallinero } = base;
      const retry = await supabase
        .from('expenses')
        .update({ ...baseNoGallinero, ...qtyFields })
        .eq('organization_id', organizationId)
        .eq('id', id)
        .select(EXPENSE_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
      if (isMissingColumnError(error, 'quantity_kg')) {
        const { quantity_kg: _qk, ...rest } = { ...baseNoGallinero, ...qtyFields };
        const retry2 = await supabase
          .from('expenses')
          .update({ ...rest, quantity: quantityKg })
          .eq('organization_id', organizationId)
          .eq('id', id)
          .select(EXPENSE_SELECT)
          .single();
        data = retry2.data;
        error = retry2.error;
      }
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
