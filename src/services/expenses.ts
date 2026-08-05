import { supabase } from './supabase';
import { Expense, PackagingItemKey } from '../types';
import { addOneLocalCalendarDayYmd } from '../utils/statsPeriod';
import {
  expenseQuantityWritePayload,
  resolveExpenseQuantityKg,
} from './expenseQuantity';
import { normalizeAmortizationMonths } from '../utils/productionCost';

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

export type ExpenseAmortizationFields = {
  amortization_months?: number | null;
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
    amortization_months: normalizeAmortizationMonths(row.amortization_months),
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

/** undefined = no tocar; number = guardar (clamp 1–60). */
function amortizationPayload(
  amortization?: ExpenseAmortizationFields | null
): Partial<{ amortization_months: number }> {
  if (!amortization || amortization.amortization_months == null) return {};
  return { amortization_months: normalizeAmortizationMonths(amortization.amortization_months) };
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
  const msg = String(e.message || '');
  const col = `'${column}'`;
  return (
    (e.code === 'PGRST204' || e.code === '42703') &&
    (msg.includes(col) || msg.toLowerCase().includes(column.toLowerCase()))
  );
}

/** Extrae nombre de columna faltante desde error PostgREST / Postgres. */
function missingColumnName(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { code?: string; message?: string };
  const msg = String(e.message || '');
  if (e.code !== 'PGRST204' && e.code !== '42703') return null;
  const m = msg.match(/'([a-zA-Z0-9_]+)'/);
  return m?.[1] ?? null;
}

function normalizeGallineroId(gallineroId?: string | null): string | null {
  const id = String(gallineroId ?? '').trim();
  return id.length > 0 ? id : null;
}

async function writeExpenseRow(
  mode: 'insert' | 'update',
  organizationId: string,
  id: string | null,
  payload: Record<string, unknown>,
  quantityKg: number
): Promise<Expense> {
  const run = async (row: Record<string, unknown>, select: string) => {
    if (mode === 'insert') {
      return supabase.from('expenses').insert(row).select(select).single();
    }
    return supabase
      .from('expenses')
      .update(row)
      .eq('organization_id', organizationId)
      .eq('id', id as string)
      .select(select)
      .single();
  };

  let row: Record<string, unknown> = { ...payload };
  let select = EXPENSE_SELECT;
  let { data, error } = await run(row, select);

  for (let attempt = 0; attempt < 10 && error; attempt++) {
    const col = missingColumnName(error);
    if (col === 'amortization_months') {
      row = stripOptionalExpenseColumns(row, 'amortization_months');
    } else if (col === 'bags_count' || col === 'bag_weight_kg') {
      row = stripOptionalExpenseColumns(row, 'bags_count', 'bag_weight_kg');
    } else if (col === 'packaging_quantity' || col === 'packaging_item_key') {
      row = stripOptionalExpenseColumns(row, 'packaging_quantity', 'packaging_item_key');
      select = EXPENSE_SELECT_CORE;
    } else if (col === 'gallinero_id') {
      row = stripOptionalExpenseColumns(row, 'gallinero_id');
    } else if (col === 'quantity') {
      row = stripOptionalExpenseColumns(row, 'quantity');
      row.quantity_kg = quantityKg;
    } else if (col === 'quantity_kg') {
      row = stripOptionalExpenseColumns(row, 'quantity_kg');
      row.quantity = quantityKg;
    } else if (select === EXPENSE_SELECT) {
      // Join gallineros u otro fallo de select: reintentar sin embed.
      select = '*';
    } else if (select === '*') {
      select = EXPENSE_SELECT_CORE_WITH_QUANTITY;
    } else if (select === EXPENSE_SELECT_CORE_WITH_QUANTITY) {
      select = EXPENSE_SELECT_CORE;
    } else {
      break;
    }
    ({ data, error } = await run(row, select));
  }

  if (error) throw error;
  return mapExpenseRow(data as Record<string, unknown>);
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
    bags?: ExpenseBagsFields | null,
    amortization?: ExpenseAmortizationFields | null
  ): Promise<Expense> {
    const packagingFields = packagingPayload(packaging);
    const bagsFields = bagsPayload(bags);
    const amortFields = amortizationPayload(amortization);
    const qtyFields = expenseQuantityWritePayload(quantityKg);
    const payload = {
      organization_id: organizationId,
      expense_date: date,
      description,
      total_price: totalPrice,
      gallinero_id: normalizeGallineroId(gallineroId ?? null),
      ...packagingFields,
      ...bagsFields,
      ...amortFields,
      ...qtyFields,
    };
    return writeExpenseRow('insert', organizationId, null, payload, quantityKg);
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
    bags?: ExpenseBagsFields | null,
    amortization?: ExpenseAmortizationFields | null
  ): Promise<Expense> {
    const packagingFields = packagingPayload(packaging);
    const bagsFields = bagsPayload(bags);
    const amortFields = amortizationPayload(amortization);
    const qtyFields = expenseQuantityWritePayload(quantityKg);
    const payload = {
      expense_date: date,
      description,
      total_price: totalPrice,
      gallinero_id: normalizeGallineroId(gallineroId ?? null),
      ...packagingFields,
      ...bagsFields,
      ...amortFields,
      ...qtyFields,
    };
    return writeExpenseRow('update', organizationId, id, payload, quantityKg);
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
