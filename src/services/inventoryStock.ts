import { supabase } from './supabase';
import type {
  FeedConsumptionMonthly,
  PackagingItemKey,
  PackagingStockBaseline,
  ProductionRecord,
  Sale,
  SaleType,
} from '../types';
import { gallinerosService } from './gallineros';
import {
  computeEggStock,
  aggregateClosedMonthFeedRates,
  computeFeedStockKg,
  computeMapleStock,
  computeMapleStockFromBaseline,
  dateOnOrAfter,
  estimateFeedDaysRemaining,
  type EggStockItemKey,
  type MapleStockItemKey,
  EGG_STOCK_LABELS,
  EGGS_PER_SALE_TYPE,
  MAPLE_STOCK_LABELS,
} from './inventoryStockCalc';
import { resolveExpenseQuantityKg } from './expenseQuantity';

export {
  EGGS_PER_SALE_TYPE,
  GENERIC_EGG_SALE_TYPES,
  MAPLE_PACKAGING_SALE_TYPES,
  EGG_STOCK_LABELS,
  MAPLE_STOCK_LABELS,
  DEFAULT_FEED_GRAMS_PER_HEN_DAY,
  eggImpactForSale,
  mapleImpactForSale,
  computeEggStock,
  computeMapleStock,
  computeMapleStockFromBaseline,
  dateOnOrAfter,
  computeFeedStockKg,
  aggregateClosedMonthFeedRates,
  averageGramsPerHenDayFromClosedMonths,
  estimateDaysFromFeedKg,
  estimateFeedDaysRemaining,
  formatFeedReachFromToday,
  formatUnknownError,
  availableEggStockForSale,
  availableMapleStockForSale,
} from './inventoryStockCalc';
export type {
  EggStockItemKey,
  MapleStockItemKey,
  FeedDaysEstimate,
  ClosedMonthFeedRate,
} from './inventoryStockCalc';

export interface EggInventorySnapshot {
  bySize: Record<EggStockItemKey, number>;
  /** Stock disponible (entradas − salidas, piso 0). */
  total: number;
  /** Suma de eggs_count en todo el historial de producción. */
  totalProduced: number;
  /** Huevos equivalentes vendidos en todo el historial. */
  totalSold: number;
}

export interface MapleInventorySnapshot {
  byItem: Record<MapleStockItemKey, number>;
  /** Null = sin apertura; cálculo histórico completo (retrocompatible). */
  baseline: {
    baselineDate: string;
    byItem: Record<MapleStockItemKey, number>;
  } | null;
}

export interface FeedInventorySnapshot {
  stockKg: number;
  daysRemaining: number | null;
  /** g/ave/día usado para estimar días (historial plausible o default 117). */
  gramsPerHenDay: number;
  gramsSource: 'history' | 'default';
  activeHens: number;
  /**
   * Último mes cerrado con declaración (mismo cálculo crudo que Gastos):
   * (kg * 1000) / (días * aves). Null si no hay ninguno.
   */
  lastClosedMonth: {
    year: number;
    month: number;
    kgConsumed: number;
    gramsPerHenDay: number;
    hens: number;
  } | null;
}

function mapSaleRow(row: Record<string, unknown>): Sale {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    customer_id: (row.customer_id as string | null) ?? null,
    date: row.sale_date as string,
    type: row.sale_type as SaleType,
    quantity: Number(row.quantity || 0),
    price_per_unit: Number(row.unit_price ?? row.price_per_unit ?? 0),
    total_price: Number(row.total_price || 0),
    notes: (row.notes as string) || '',
    created_at: row.created_at as string,
  };
}

function resolveExpenseKg(row: Record<string, unknown>): number {
  return resolveExpenseQuantityKg(row);
}

function isMissingBaselineTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('packaging_stock_baselines') &&
      (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache')))
  );
}

function mapBaselineRow(row: Record<string, unknown>): PackagingStockBaseline {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    baseline_date: String(row.baseline_date).slice(0, 10),
    maple: Math.max(0, Math.floor(Number(row.maple) || 0)),
    docena: Math.max(0, Math.floor(Number(row.docena) || 0)),
    media_docena: Math.max(0, Math.floor(Number(row.media_docena) || 0)),
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

async function fetchSales(organizationId: string): Promise<Sale[]> {
  const { data, error } = await supabase
    .from('sales')
    .select(
      'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, price_per_unit, total_price, notes, created_at'
    )
    .eq('organization_id', organizationId);
  if (error) {
    const retry = await supabase
      .from('sales')
      .select(
        'id, organization_id, customer_id, sale_date, sale_type, quantity, unit_price, total_price, notes, created_at'
      )
      .eq('organization_id', organizationId);
    if (retry.error) throw retry.error;
    return (retry.data || []).map((row) => mapSaleRow(row as Record<string, unknown>));
  }
  return (data || []).map((row) => mapSaleRow(row as Record<string, unknown>));
}

async function fetchProduction(organizationId: string): Promise<ProductionRecord[]> {
  const { data, error } = await supabase
    .from('production_records')
    .select('*')
    .eq('organization_id', organizationId);
  if (error) throw error;
  return (data || []) as ProductionRecord[];
}

async function fetchPackagingBaseline(
  organizationId: string
): Promise<PackagingStockBaseline | null> {
  const { data, error } = await supabase
    .from('packaging_stock_baselines')
    .select(
      'id, organization_id, baseline_date, maple, docena, media_docena, created_by, created_at, updated_at'
    )
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    if (isMissingBaselineTableError(error)) {
      console.warn('packaging_stock_baselines unavailable; using historic maple stock:', error.message);
      return null;
    }
    throw error;
  }
  if (!data) return null;
  return mapBaselineRow(data as Record<string, unknown>);
}

function sumPackagingPurchases(
  rows: Array<Record<string, unknown>>,
  fromDateInclusive?: string | null
): Record<MapleStockItemKey, number> {
  const out: Record<MapleStockItemKey, number> = {
    maple: 0,
    docena: 0,
    media_docena: 0,
  };
  for (const row of rows) {
    if (fromDateInclusive) {
      const expenseDate = String(row.expense_date ?? '').slice(0, 10);
      if (!expenseDate || !dateOnOrAfter(expenseDate, fromDateInclusive)) continue;
    }
    const qty = Number(row.packaging_quantity);
    const key = row.packaging_item_key as PackagingItemKey | null;
    if (!Number.isFinite(qty) || qty <= 0 || !key || !(key in out)) continue;
    out[key] += qty;
  }
  return out;
}

function mapConsumptions(rows: Array<Record<string, unknown>>): FeedConsumptionMonthly[] {
  return rows.map(
    (row) =>
      ({
        id: row.id as string,
        organization_id: row.organization_id as string,
        gallinero_id: (row.gallinero_id as string | null) ?? null,
        year: Number(row.year),
        month: Number(row.month),
        kg_consumed: Number(row.kg_consumed ?? 0),
        notes: (row.notes as string | null) ?? null,
        hens_snapshot: row.hens_snapshot != null ? Number(row.hens_snapshot) : null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      }) satisfies FeedConsumptionMonthly
  );
}

/**
 * Inventario automático: stock = entradas − salidas (histórico completo).
 * Packaging puede usar apertura opcional (packaging_stock_baselines).
 * No usa inventory_counts (tabla queda sin uso; no se elimina).
 */
export const inventoryStockService = {
  async loadEggInventory(organizationId: string): Promise<EggInventorySnapshot> {
    const [production, sales] = await Promise.all([
      fetchProduction(organizationId),
      fetchSales(organizationId),
    ]);
    const bySize = computeEggStock(production, sales);
    const total = bySize.grande + bySize.mediano + bySize.chico + bySize.sin_clasificar;
    const totalProduced = production.reduce((sum, p) => sum + (p.eggs_count || 0), 0);
    const totalSold = sales.reduce(
      (sum, s) => sum + s.quantity * (EGGS_PER_SALE_TYPE[s.type] || 0),
      0
    );
    return { bySize, total, totalProduced, totalSold };
  },

  async loadMapleInventory(organizationId: string): Promise<MapleInventorySnapshot> {
    const [sales, expensesRes, baseline] = await Promise.all([
      fetchSales(organizationId),
      supabase
        .from('expenses')
        .select('expense_date, packaging_quantity, packaging_item_key, description')
        .eq('organization_id', organizationId)
        .eq('description', 'Maples / Packaging')
        .not('packaging_quantity', 'is', null),
      fetchPackagingBaseline(organizationId),
    ]);

    let expenseRows: Array<Record<string, unknown>> = [];
    if (expensesRes.error) {
      // Columnas packaging pueden no existir aún en alguna org: stock solo por salidas.
      console.warn('Maples packaging expenses unavailable:', expensesRes.error.message);
    } else {
      expenseRows = (expensesRes.data || []) as Array<Record<string, unknown>>;
    }

    if (!baseline) {
      const purchased = sumPackagingPurchases(expenseRows);
      return { byItem: computeMapleStock(purchased, sales), baseline: null };
    }

    const cutoff = baseline.baseline_date;
    const purchasedAfter = sumPackagingPurchases(expenseRows, cutoff);
    const salesAfter = sales.filter((s) => dateOnOrAfter(s.date, cutoff));
    const baselineByItem: Record<MapleStockItemKey, number> = {
      maple: baseline.maple,
      docena: baseline.docena,
      media_docena: baseline.media_docena,
    };
    return {
      byItem: computeMapleStockFromBaseline(purchasedAfter, salesAfter, baselineByItem),
      baseline: { baselineDate: cutoff, byItem: baselineByItem },
    };
  },

  /**
   * Declara o actualiza la apertura de packaging (upsert por organización).
   * Requiere que la migración packaging_stock_baselines esté aplicada.
   */
  async savePackagingBaseline(
    organizationId: string,
    createdBy: string | null,
    input: {
      baselineDate: string;
      maple: number;
      docena: number;
      media_docena: number;
    }
  ): Promise<PackagingStockBaseline> {
    const baseline_date = String(input.baselineDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(baseline_date)) {
      throw new Error('Fecha de apertura inválida');
    }
    const payload = {
      organization_id: organizationId,
      baseline_date,
      maple: Math.max(0, Math.floor(Number(input.maple) || 0)),
      docena: Math.max(0, Math.floor(Number(input.docena) || 0)),
      media_docena: Math.max(0, Math.floor(Number(input.media_docena) || 0)),
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('packaging_stock_baselines')
      .upsert(payload, { onConflict: 'organization_id' })
      .select(
        'id, organization_id, baseline_date, maple, docena, media_docena, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      if (isMissingBaselineTableError(error)) {
        throw new Error(
          'Falta aplicar la migración de apertura de packaging en la base de datos. Pedile a quien administra el proyecto que ejecute el SQL en Supabase.'
        );
      }
      throw error;
    }
    return mapBaselineRow(data as Record<string, unknown>);
  },

  async loadFeedInventory(organizationId: string): Promise<FeedInventorySnapshot> {
    const [expensesRes, consumptionRes, gallineros] = await Promise.all([
      supabase
        .from('expenses')
        .select('expense_date, description, quantity_kg, quantity')
        .eq('organization_id', organizationId)
        .eq('description', 'Alimento'),
      supabase
        .from('feed_consumption_monthly')
        .select(
          'id, organization_id, gallinero_id, year, month, kg_consumed, notes, hens_snapshot, created_at, updated_at'
        )
        .eq('organization_id', organizationId),
      gallinerosService.getAll(organizationId),
    ]);
    if (expensesRes.error) throw expensesRes.error;
    if (consumptionRes.error) throw consumptionRes.error;

    let purchasedKg = 0;
    for (const row of expensesRes.data || []) {
      purchasedKg += resolveExpenseKg(row as Record<string, unknown>);
    }
    const consumptions = mapConsumptions((consumptionRes.data || []) as Array<Record<string, unknown>>);
    const consumedKg = consumptions.reduce((sum, c) => sum + Math.max(0, Number(c.kg_consumed) || 0), 0);
    const stockKg = computeFeedStockKg(purchasedKg, consumedKg);
    const activeHens = gallineros.reduce(
      (sum, g) => sum + Math.max(0, Math.floor(Number(g.current_count) || 0)),
      0
    );
    const estimate = estimateFeedDaysRemaining(stockKg, consumptions, activeHens);
    const lastClosed = aggregateClosedMonthFeedRates(consumptions, activeHens)[0] ?? null;
    return {
      stockKg,
      daysRemaining: estimate.daysRemaining,
      gramsPerHenDay: estimate.gramsPerHenDay,
      gramsSource: estimate.gramsSource,
      activeHens: estimate.activeHens,
      lastClosedMonth: lastClosed
        ? {
            year: lastClosed.year,
            month: lastClosed.month,
            kgConsumed: lastClosed.kgConsumed,
            gramsPerHenDay: lastClosed.gramsPerHenDay,
            hens: lastClosed.hens,
          }
        : null,
    };
  },

  /** Carga paralela para el tablero. */
  async loadBoard(organizationId: string): Promise<{
    eggs: EggInventorySnapshot;
    feed: FeedInventorySnapshot;
    maples: MapleInventorySnapshot;
  }> {
    const [eggs, feed, maples] = await Promise.all([
      this.loadEggInventory(organizationId),
      this.loadFeedInventory(organizationId),
      this.loadMapleInventory(organizationId),
    ]);
    return { eggs, feed, maples };
  },

  labels: {
    eggs: EGG_STOCK_LABELS,
    maples: MAPLE_STOCK_LABELS,
  },
};
