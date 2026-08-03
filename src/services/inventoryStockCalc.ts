import type { FeedConsumptionMonthly, PackagingItemKey, ProductionRecord, Sale, SaleType } from '../types';

export const EGGS_PER_SALE_TYPE: Record<SaleType, number> = {
  maple: 30,
  docena: 12,
  media_docena: 6,
  pack15: 15,
  maple_grande: 30,
  maple_mediano: 30,
  maple_chico: 30,
};

/** Ventas genéricas: descuentan huevos de "Sin clasificar". */
export const GENERIC_EGG_SALE_TYPES: SaleType[] = [
  'maple',
  'docena',
  'media_docena',
  'pack15',
];

/** Ventas que consumen 1 unidad física de packaging Maple. */
export const MAPLE_PACKAGING_SALE_TYPES: SaleType[] = [
  'maple',
  'pack15',
  'maple_grande',
  'maple_mediano',
  'maple_chico',
];

export type EggStockItemKey = 'grande' | 'mediano' | 'chico' | 'sin_clasificar';
export type MapleStockItemKey = PackagingItemKey;

export const EGG_STOCK_LABELS: Record<EggStockItemKey, string> = {
  grande: 'Grande',
  mediano: 'Mediano',
  chico: 'Chico',
  sin_clasificar: 'Sin clasificar',
};

export const MAPLE_STOCK_LABELS: Record<MapleStockItemKey, string> = {
  maple: 'Maple',
  docena: 'Docena',
  media_docena: 'Media Docena',
};

/** Huevos que descuenta una venta y en qué bucket. */
export function eggImpactForSale(
  type: SaleType,
  quantity: number
): { key: EggStockItemKey; eggs: number } {
  const qty = Math.max(0, Number(quantity) || 0);
  const eggs = qty * (EGGS_PER_SALE_TYPE[type] || 0);
  if (type === 'maple_grande') return { key: 'grande', eggs };
  if (type === 'maple_mediano') return { key: 'mediano', eggs };
  if (type === 'maple_chico') return { key: 'chico', eggs };
  return { key: 'sin_clasificar', eggs };
}

/** Packaging que descuenta una venta (si aplica). */
export function mapleImpactForSale(
  type: SaleType,
  quantity: number
): { key: MapleStockItemKey; units: number } | null {
  const qty = Math.max(0, Number(quantity) || 0);
  if (MAPLE_PACKAGING_SALE_TYPES.includes(type)) return { key: 'maple', units: qty };
  if (type === 'docena') return { key: 'docena', units: qty };
  if (type === 'media_docena') return { key: 'media_docena', units: qty };
  return null;
}

/**
 * Stock de huevos acumulado (histórico completo). Usado por Inventario y Panel.
 *
 * - Cada tamaño (grande/mediano/chico) se agota hasta 0; nunca queda negativo.
 * - El excedente de una sobreventa por tamaño (y las ventas genéricas) se
 *   refleja en "Sin clasificar" vía el residual:
 *   sin_clasificar = stockDisponible − grande − mediano − chico
 *   (ambos lados con piso en 0).
 */
export function computeEggStock(
  production: ProductionRecord[],
  sales: Sale[]
): Record<EggStockItemKey, number> {
  const totalProducidos = production.reduce((sum, p) => sum + (p.eggs_count || 0), 0);
  const totalVendidos = sales.reduce(
    (sum, s) => sum + s.quantity * (EGGS_PER_SALE_TYPE[s.type] || 0),
    0
  );
  const stockDisponible = Math.max(0, totalProducidos - totalVendidos);

  const producedLarge = production.reduce((s, p) => s + (p.eggs_large ?? 0), 0);
  const producedMedium = production.reduce((s, p) => s + (p.eggs_medium ?? 0), 0);
  const producedSmall = production.reduce((s, p) => s + (p.eggs_small ?? 0), 0);

  const soldLarge = sales
    .filter((s) => s.type === 'maple_grande')
    .reduce((sum, s) => sum + s.quantity * 30, 0);
  const soldMedium = sales
    .filter((s) => s.type === 'maple_mediano')
    .reduce((sum, s) => sum + s.quantity * 30, 0);
  const soldSmall = sales
    .filter((s) => s.type === 'maple_chico')
    .reduce((sum, s) => sum + s.quantity * 30, 0);

  const grande = Math.max(0, producedLarge - soldLarge);
  const mediano = Math.max(0, producedMedium - soldMedium);
  const chico = Math.max(0, producedSmall - soldSmall);
  const sin_clasificar = Math.max(0, stockDisponible - grande - mediano - chico);

  return { grande, mediano, chico, sin_clasificar };
}

/**
 * Stock de packaging: compras (packaging_quantity) − ventas.
 * purchasedByItem ya viene sumado por ítem.
 */
export function computeMapleStock(
  purchasedByItem: Record<MapleStockItemKey, number>,
  sales: Sale[]
): Record<MapleStockItemKey, number> {
  const soldMaple = sales
    .filter((s) => MAPLE_PACKAGING_SALE_TYPES.includes(s.type))
    .reduce((sum, s) => sum + s.quantity, 0);
  const soldDocena = sales
    .filter((s) => s.type === 'docena')
    .reduce((sum, s) => sum + s.quantity, 0);
  const soldMediaDocena = sales
    .filter((s) => s.type === 'media_docena')
    .reduce((sum, s) => sum + s.quantity, 0);

  return {
    maple: (purchasedByItem.maple || 0) - soldMaple,
    docena: (purchasedByItem.docena || 0) - soldDocena,
    media_docena: (purchasedByItem.media_docena || 0) - soldMediaDocena,
  };
}

/** Stock alimento (kg) = compras Alimento − consumo declarado. */
export function computeFeedStockKg(purchasedKg: number, consumedKg: number): number {
  return (Number(purchasedKg) || 0) - (Number(consumedKg) || 0);
}

/**
 * Referencia típica para ponedoras cuando no hay meses cerrados con declaración.
 * (~110–120 g/ave/día en producción comercial; no había otra constante en el código.)
 */
export const DEFAULT_FEED_GRAMS_PER_HEN_DAY = 117;

/**
 * Rango biológico razonable para ponedoras.
 * Si el promedio histórico cae fuera, se ignora (datos de prueba / declaración incompleta)
 * y se usa DEFAULT_FEED_GRAMS_PER_HEN_DAY.
 */
export const MIN_PLAUSIBLE_FEED_GRAMS_PER_HEN_DAY = 80;
export const MAX_PLAUSIBLE_FEED_GRAMS_PER_HEN_DAY = 160;

export type FeedDaysEstimate = {
  daysRemaining: number | null;
  /** g/ave/día usado en el estimado */
  gramsPerHenDay: number;
  gramsSource: 'history' | 'default';
  activeHens: number;
};

export type ClosedMonthFeedRate = {
  year: number;
  month: number;
  kgConsumed: number;
  daysInMonth: number;
  hens: number;
  gramsPerHenDay: number;
};

function isClosedMonth(year: number, month: number, now: Date): boolean {
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  return year < cy || (year === cy && month < cm);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Agrega declaraciones al mes (misma regla que Estadísticas):
 * - Si hay fila de granja general (gallinero_id null), usa solo esas.
 * - Si no, suma kg de gallineros.
 * - Aves: hens_snapshot de org, o de cualquier fila, o activeHensFallback.
 */
export function aggregateClosedMonthFeedRates(
  consumptions: FeedConsumptionMonthly[],
  activeHensFallback: number,
  now: Date = new Date(),
  maxMonths = 3
): ClosedMonthFeedRate[] {
  const byMonth = new Map<string, FeedConsumptionMonthly[]>();
  for (const c of consumptions) {
    if ((Number(c.kg_consumed) || 0) <= 0) continue;
    if (!isClosedMonth(c.year, c.month, now)) continue;
    const key = monthKey(c.year, c.month);
    const list = byMonth.get(key);
    if (list) list.push(c);
    else byMonth.set(key, [c]);
  }

  const monthKeys = [...byMonth.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).slice(0, maxMonths);
  const out: ClosedMonthFeedRate[] = [];

  for (const key of monthKeys) {
    const rows = byMonth.get(key)!;
    const year = rows[0].year;
    const month = rows[0].month;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (daysInMonth <= 0) continue;

    const orgLevel = rows.filter((r) => r.gallinero_id == null);
    const kgSource = orgLevel.length > 0 ? orgLevel : rows;
    const kgConsumed = kgSource.reduce((sum, r) => sum + Math.max(0, Number(r.kg_consumed) || 0), 0);

    const hensFromOrg = orgLevel.find((r) => r.hens_snapshot != null && r.hens_snapshot > 0);
    const hensFromAny = rows.find((r) => r.hens_snapshot != null && r.hens_snapshot > 0);
    const hens =
      hensFromOrg?.hens_snapshot != null && hensFromOrg.hens_snapshot > 0
        ? hensFromOrg.hens_snapshot
        : hensFromAny?.hens_snapshot != null && hensFromAny.hens_snapshot > 0
          ? hensFromAny.hens_snapshot
          : activeHensFallback;

    if (kgConsumed <= 0 || hens <= 0) continue;
    out.push({
      year,
      month,
      kgConsumed,
      daysInMonth,
      hens,
      gramsPerHenDay: (kgConsumed * 1000) / (daysInMonth * hens),
    });
  }

  return out;
}

export function isPlausibleFeedGramsPerHenDay(grams: number): boolean {
  return (
    Number.isFinite(grams) &&
    grams >= MIN_PLAUSIBLE_FEED_GRAMS_PER_HEN_DAY &&
    grams <= MAX_PLAUSIBLE_FEED_GRAMS_PER_HEN_DAY
  );
}

/**
 * Promedio de g/ave/día de los últimos meses CERRADOS con kg > 0.
 * Misma base que Gastos/Estadísticas: (kg * 1000) / (días_del_mes * aves),
 * agregando por mes (prioridad declaración de granja general).
 * Si el promedio no es biológicamente plausible, retorna null (usar default).
 */
export function averageGramsPerHenDayFromClosedMonths(
  consumptions: FeedConsumptionMonthly[],
  activeHensFallback: number,
  now: Date = new Date(),
  maxMonths = 3
): number | null {
  const months = aggregateClosedMonthFeedRates(
    consumptions,
    activeHensFallback,
    now,
    maxMonths
  );
  if (months.length === 0) return null;
  const avg = months.reduce((sum, m) => sum + m.gramsPerHenDay, 0) / months.length;
  return isPlausibleFeedGramsPerHenDay(avg) ? avg : null;
}

/** Días que alcanza una cantidad de kg al ritmo g/ave/día × aves. */
export function estimateDaysFromFeedKg(
  kg: number,
  gramsPerHenDay: number,
  activeHens: number
): number | null {
  const stock = Number(kg) || 0;
  const grams = Number(gramsPerHenDay) || 0;
  const hens = Math.max(0, Math.floor(Number(activeHens) || 0));
  if (!(stock > 0) || !(grams > 0) || hens <= 0) return null;
  const dailyKg = (grams * hens) / 1000;
  if (!(dailyKg > 0)) return null;
  return stock / dailyKg;
}

/** Días restantes → etiquetas claras “desde hoy” / fecha estimada. */
export function formatFeedReachFromToday(
  daysRemaining: number,
  now: Date = new Date()
): { daysLabel: string; untilLabel: string } {
  const days = Math.max(0, Number(daysRemaining) || 0);
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  until.setDate(until.getDate() + Math.max(0, Math.floor(days)));
  const untilLabel = until.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return { daysLabel: days.toFixed(1), untilLabel };
}

/** Mensaje de error legible desde Postgrest / Error genérico. */
export function formatUnknownError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.hint]
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

/**
 * Días restantes estimados:
 * consumo_diario_kg = (g/ave/día * aves_activas) / 1000
 * días = stock_kg / consumo_diario_kg
 *
 * g/ave/día = promedio de meses cerrados; si no hay, DEFAULT_FEED_GRAMS_PER_HEN_DAY.
 */
export function estimateFeedDaysRemaining(
  stockKg: number,
  consumptions: FeedConsumptionMonthly[],
  activeHens: number,
  now: Date = new Date(),
  maxClosedMonths = 3
): FeedDaysEstimate {
  const hens = Math.max(0, Math.floor(Number(activeHens) || 0));
  const fromHistory = averageGramsPerHenDayFromClosedMonths(
    consumptions,
    hens,
    now,
    maxClosedMonths
  );
  const gramsPerHenDay = fromHistory ?? DEFAULT_FEED_GRAMS_PER_HEN_DAY;
  const gramsSource: 'history' | 'default' = fromHistory != null ? 'history' : 'default';

  if (!Number.isFinite(stockKg) || stockKg <= 0) {
    return {
      daysRemaining: stockKg <= 0 ? 0 : null,
      gramsPerHenDay,
      gramsSource,
      activeHens: hens,
    };
  }

  return {
    daysRemaining: estimateDaysFromFeedKg(stockKg, gramsPerHenDay, hens),
    gramsPerHenDay,
    gramsSource,
    activeHens: hens,
  };
}

/** stock disponible para una venta, sumando de vuelta el impacto de la venta en edición. */
export function availableEggStockForSale(
  stock: Record<EggStockItemKey, number>,
  type: SaleType,
  quantity: number,
  editingSale?: Sale | null
): number {
  const impact = eggImpactForSale(type, quantity);
  let available = stock[impact.key] ?? 0;
  if (editingSale) {
    const prev = eggImpactForSale(editingSale.type, editingSale.quantity);
    if (prev.key === impact.key) available += prev.eggs;
  }
  return available;
}

export function availableMapleStockForSale(
  stock: Record<MapleStockItemKey, number>,
  type: SaleType,
  quantity: number,
  editingSale?: Sale | null
): { key: MapleStockItemKey; available: number; needed: number } | null {
  const impact = mapleImpactForSale(type, quantity);
  if (!impact) return null;
  let available = stock[impact.key] ?? 0;
  if (editingSale) {
    const prev = mapleImpactForSale(editingSale.type, editingSale.quantity);
    if (prev && prev.key === impact.key) available += prev.units;
  }
  return { key: impact.key, available, needed: impact.units };
}
