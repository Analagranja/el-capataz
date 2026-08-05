/**
 * Costo de producción para Estadísticas / export (no contabilidad de caja).
 *
 * - Alimento: $/kg promedio (compras ≤ fin de mes) × kg consumidos del mes
 * - Maples: $/u promedio por ítem × unidades vendidas del mes
 * - Otros: total_price / amortization_months en cada mes del prorrateo
 */
import type {
  Expense,
  FeedConsumptionMonthly,
  PackagingItemKey,
  Sale,
} from '../types';
import { mapleImpactForSale, sumKgForMonthRows } from '../services/inventoryStockCalc';

export const EXPENSE_DESC_ALIMENTO = 'Alimento';
export const EXPENSE_DESC_MAPLES = 'Maples / Packaging';
export const MAX_AMORTIZATION_MONTHS = 60;
/** Compras históricas para promedio y spill de prorrateo (máx. 60 meses). */
export const EXPENSE_COST_LOOKBACK_YEARS = 5;

export type ProductionCostWarnings = {
  missingFeedConsumption: boolean;
  missingFeedUnitCost: boolean;
  missingMapleUnitCost: boolean;
};

export type MonthProductionCost = {
  year: number;
  month: number;
  alimento: number;
  maples: number;
  otros: number;
  total: number;
  warnings: ProductionCostWarnings;
};

export type PeriodProductionCost = {
  alimento: number;
  maples: number;
  otros: number;
  total: number;
  warnings: ProductionCostWarnings;
  months: MonthProductionCost[];
};

export function isAlimentoExpense(e: Pick<Expense, 'description'>): boolean {
  return e.description === EXPENSE_DESC_ALIMENTO;
}

export function isMaplesExpense(e: Pick<Expense, 'description'>): boolean {
  return e.description === EXPENSE_DESC_MAPLES;
}

/** Transporte, Veterinario, Mantenimiento, Otro (texto libre), etc. */
export function isAmortizableOtherExpense(e: Pick<Expense, 'description'>): boolean {
  return !isAlimentoExpense(e) && !isMaplesExpense(e);
}

export function normalizeAmortizationMonths(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_AMORTIZATION_MONTHS, n);
}

export function monthEndYmd(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(last)}`;
}

export function parseExpenseYearMonth(dateYmd: string): { year: number; month: number } | null {
  const y = Number(String(dateYmd).slice(0, 4));
  const m = Number(String(dateYmd).slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function dateOnOrBefore(dateYmd: string, cutoffYmd: string): boolean {
  return String(dateYmd || '').slice(0, 10) <= String(cutoffYmd || '').slice(0, 10);
}

/** $/kg ponderado de Alimento con quantity_kg > 0 y fecha ≤ asOfEndYmd. Null si no hay base. */
export function weightedAvgFeedCostPerKg(
  expenses: Expense[],
  asOfEndYmd: string
): number | null {
  let totalPrice = 0;
  let totalKg = 0;
  for (const e of expenses) {
    if (!isAlimentoExpense(e)) continue;
    if (!dateOnOrBefore(e.date, asOfEndYmd)) continue;
    const kg = Number(e.quantity_kg) || 0;
    const price = Number(e.total_price) || 0;
    if (!(kg > 0) || !(price >= 0)) continue;
    totalKg += kg;
    totalPrice += price;
  }
  if (!(totalKg > 0)) return null;
  return totalPrice / totalKg;
}

/** $/unidad ponderado por ítem de packaging (compras Maples con qty+key). */
export function weightedAvgPackagingCostByItem(
  expenses: Expense[],
  asOfEndYmd: string
): Record<PackagingItemKey, number | null> {
  const totals: Record<PackagingItemKey, { price: number; qty: number }> = {
    maple: { price: 0, qty: 0 },
    docena: { price: 0, qty: 0 },
    media_docena: { price: 0, qty: 0 },
  };
  for (const e of expenses) {
    if (!isMaplesExpense(e)) continue;
    if (!dateOnOrBefore(e.date, asOfEndYmd)) continue;
    const key = e.packaging_item_key;
    const qty = Number(e.packaging_quantity) || 0;
    const price = Number(e.total_price) || 0;
    if (!key || !(key in totals) || !(qty > 0) || !(price >= 0)) continue;
    totals[key].qty += qty;
    totals[key].price += price;
  }
  return {
    maple: totals.maple.qty > 0 ? totals.maple.price / totals.maple.qty : null,
    docena: totals.docena.qty > 0 ? totals.docena.price / totals.docena.qty : null,
    media_docena:
      totals.media_docena.qty > 0 ? totals.media_docena.price / totals.media_docena.qty : null,
  };
}

export function feedKgConsumedInMonth(
  consumptions: FeedConsumptionMonthly[],
  year: number,
  month: number
): number {
  const rows = consumptions.filter((c) => c.year === year && c.month === month);
  return sumKgForMonthRows(rows);
}

export function packagingUnitsSoldInMonth(
  sales: Sale[],
  year: number,
  month: number
): Record<PackagingItemKey, number> {
  const prefix = ymKey(year, month);
  const out: Record<PackagingItemKey, number> = {
    maple: 0,
    docena: 0,
    media_docena: 0,
  };
  for (const s of sales) {
    if (!String(s.date || '').startsWith(prefix)) continue;
    const impact = mapleImpactForSale(s.type, s.quantity);
    if (!impact) continue;
    out[impact.key] += impact.units;
  }
  return out;
}

/** Cuota de "otros" que cae en (year, month). */
export function otherAmortizedCostInMonth(
  expenses: Expense[],
  year: number,
  month: number
): number {
  let total = 0;
  for (const e of expenses) {
    if (!isAmortizableOtherExpense(e)) continue;
    const start = parseExpenseYearMonth(e.date);
    if (!start) continue;
    const months = normalizeAmortizationMonths(e.amortization_months);
    const startIdx = start.year * 12 + (start.month - 1);
    const targetIdx = year * 12 + (month - 1);
    if (targetIdx < startIdx || targetIdx > startIdx + months - 1) continue;
    const price = Number(e.total_price) || 0;
    if (!(price > 0)) continue;
    total += price / months;
  }
  return total;
}

export function computeMonthProductionCost(
  year: number,
  month: number,
  expenses: Expense[],
  sales: Sale[],
  consumptions: FeedConsumptionMonthly[]
): MonthProductionCost {
  const asOf = monthEndYmd(year, month);
  const kg = feedKgConsumedInMonth(consumptions, year, month);
  const feedAvg = weightedAvgFeedCostPerKg(expenses, asOf);
  const missingFeedConsumption = !(kg > 0);
  const missingFeedUnitCost = kg > 0 && feedAvg == null;
  const alimento = kg > 0 && feedAvg != null ? kg * feedAvg : 0;

  const units = packagingUnitsSoldInMonth(sales, year, month);
  const packAvg = weightedAvgPackagingCostByItem(expenses, asOf);
  let maples = 0;
  let missingMapleUnitCost = false;
  (Object.keys(units) as PackagingItemKey[]).forEach((key) => {
    const u = units[key];
    if (!(u > 0)) return;
    const avg = packAvg[key];
    if (avg == null) {
      missingMapleUnitCost = true;
      return;
    }
    maples += u * avg;
  });

  const otros = otherAmortizedCostInMonth(expenses, year, month);
  const total = alimento + maples + otros;

  return {
    year,
    month,
    alimento,
    maples,
    otros,
    total,
    warnings: {
      missingFeedConsumption,
      missingFeedUnitCost,
      missingMapleUnitCost,
    },
  };
}

export function mergeProductionCostWarnings(
  list: ProductionCostWarnings[]
): ProductionCostWarnings {
  return {
    missingFeedConsumption: list.some((w) => w.missingFeedConsumption),
    missingFeedUnitCost: list.some((w) => w.missingFeedUnitCost),
    missingMapleUnitCost: list.some((w) => w.missingMapleUnitCost),
  };
}

/** Suma costos de varios meses (mismo juego de expenses/sales/consumptions). */
export function computePeriodProductionCost(
  months: Array<{ year: number; month: number }>,
  expenses: Expense[],
  sales: Sale[],
  consumptions: FeedConsumptionMonthly[]
): PeriodProductionCost {
  const monthRows = months.map(({ year, month }) =>
    computeMonthProductionCost(year, month, expenses, sales, consumptions)
  );
  return {
    alimento: monthRows.reduce((s, r) => s + r.alimento, 0),
    maples: monthRows.reduce((s, r) => s + r.maples, 0),
    otros: monthRows.reduce((s, r) => s + r.otros, 0),
    total: monthRows.reduce((s, r) => s + r.total, 0),
    warnings: mergeProductionCostWarnings(monthRows.map((r) => r.warnings)),
    months: monthRows,
  };
}

/** Meses a incluir en el filtro Año / Mes de Estadísticas. */
export function monthsForYearMonthFilter(
  year: number,
  selectedMonth: string | number | null | undefined,
  today: Date = new Date()
): Array<{ year: number; month: number }> {
  const m = selectedMonth != null && selectedMonth !== '' ? Number(selectedMonth) : NaN;
  if (Number.isFinite(m) && m >= 1 && m <= 12) {
    return [{ year, month: m }];
  }
  const cy = today.getFullYear();
  const cm = today.getMonth() + 1;
  let end = 12;
  if (year > cy) return [];
  if (year === cy) end = cm;
  const out: Array<{ year: number; month: number }> = [];
  for (let month = 1; month <= end; month++) out.push({ year, month });
  return out;
}

export function expenseLookbackFromYmd(year: number): string {
  const fromYear = year - EXPENSE_COST_LOOKBACK_YEARS;
  return `${fromYear}-01-01`;
}
