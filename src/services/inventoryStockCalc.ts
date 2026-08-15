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
 * Piso en 0 (igual que huevos): sin saldo no queda negativo.
 */
export function computeMapleStock(
  purchasedByItem: Record<MapleStockItemKey, number>,
  sales: Sale[]
): Record<MapleStockItemKey, number> {
  return floorMapleStock(rawMapleMovement(purchasedByItem, sales));
}

/**
 * Con línea base: stock = max(0, baseline + compras − ventas).
 * Sin baseline (null): misma lógica histórica que computeMapleStock.
 * purchasedAfter / salesAfter deben venir ya filtrados por baseline_date cuando hay baseline.
 */
export function computeMapleStockFromBaseline(
  purchasedAfter: Record<MapleStockItemKey, number>,
  salesAfter: Sale[],
  baselineByItem: Record<MapleStockItemKey, number> | null
): Record<MapleStockItemKey, number> {
  const movement = rawMapleMovement(purchasedAfter, salesAfter);
  if (!baselineByItem) return floorMapleStock(movement);
  return floorMapleStock({
    maple: (baselineByItem.maple || 0) + movement.maple,
    docena: (baselineByItem.docena || 0) + movement.docena,
    media_docena: (baselineByItem.media_docena || 0) + movement.media_docena,
  });
}

function rawMapleMovement(
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

function floorMapleStock(
  stock: Record<MapleStockItemKey, number>
): Record<MapleStockItemKey, number> {
  return {
    maple: Math.max(0, stock.maple || 0),
    docena: Math.max(0, stock.docena || 0),
    media_docena: Math.max(0, stock.media_docena || 0),
  };
}

/** YYYY-MM-DD ≥ cutoff (inclusive). */
export function dateOnOrAfter(dateYmd: string, cutoffYmd: string): boolean {
  return String(dateYmd || '').slice(0, 10) >= String(cutoffYmd || '').slice(0, 10);
}

/**
 * Ventas que mueven packaging después de una apertura.
 * - Fecha de venta ≥ fecha de corte, o
 * - Cargada en el sistema después de la apertura (created_at ≥ updated_at),
 *   aunque la fecha de venta sea anterior (regularizar ventas viejas).
 */
export function saleAffectsPackagingAfterBaseline(
  sale: { date: string; created_at?: string | null },
  baselineDate: string,
  baselineUpdatedAt?: string | null
): boolean {
  if (dateOnOrAfter(sale.date, baselineDate)) return true;
  const created = String(sale.created_at || '').trim();
  const openedAt = String(baselineUpdatedAt || '').trim();
  return Boolean(created && openedAt && created >= openedAt);
}

/** Mes (year, month) ≥ mes del cutoff YYYY-MM-DD (inclusive). */
export function yearMonthOnOrAfter(year: number, month: number, cutoffYmd: string): boolean {
  const y = Number(String(cutoffYmd).slice(0, 4));
  const m = Number(String(cutoffYmd).slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return true;
  const yy = Number(year);
  const mm = Number(month);
  if (!Number.isFinite(yy) || !Number.isFinite(mm)) return false;
  return yy > y || (yy === y && mm >= m);
}

/** Stock alimento (kg) = compras Alimento − consumo declarado. */
export function computeFeedStockKg(purchasedKg: number, consumedKg: number): number {
  return (Number(purchasedKg) || 0) - (Number(consumedKg) || 0);
}

/** Stock = baseline (si hay) + compras − consumo (ambos ya filtrados por fecha). */
export function computeFeedStockFromBaseline(
  purchasedKg: number,
  consumedKg: number,
  baselineKg: number | null
): number {
  const movement = computeFeedStockKg(purchasedKg, consumedKg);
  if (baselineKg == null) return movement;
  return (Number(baselineKg) || 0) + movement;
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
  /** Fecha límite estimada (YYYY-MM-DD), anclada al último evento real — no a “hoy”. */
  untilDateYmd: string | null;
  /** Fecha de referencia del stock (baseline / última compra / último mes de consumo). */
  anchorDateYmd: string | null;
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

    const kgConsumed = sumKgForMonthRows(rows);
    const orgLevel = rows.filter((r) => r.gallinero_id == null);

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

/** Kg de un mes: prioriza declaración de granja general; si no hay, suma gallineros. */
export function sumKgForMonthRows(rows: FeedConsumptionMonthly[]): number {
  const orgLevel = rows.filter((r) => r.gallinero_id == null);
  const kgSource = orgLevel.length > 0 ? orgLevel : rows;
  return kgSource.reduce((sum, r) => sum + Math.max(0, Number(r.kg_consumed) || 0), 0);
}

/**
 * Consumo total declarado para stock de alimento.
 * Misma regla anti-dobleconteo que Estadísticas por (año, mes).
 * Si fromBaselineDate, solo meses ≥ mes de esa fecha.
 */
export function sumDeclaredFeedConsumptionKg(
  consumptions: FeedConsumptionMonthly[],
  fromBaselineDate?: string | null
): number {
  const byMonth = new Map<string, FeedConsumptionMonthly[]>();
  for (const c of consumptions) {
    if ((Number(c.kg_consumed) || 0) <= 0) continue;
    if (fromBaselineDate && !yearMonthOnOrAfter(c.year, c.month, fromBaselineDate)) continue;
    const key = monthKey(c.year, c.month);
    const list = byMonth.get(key);
    if (list) list.push(c);
    else byMonth.set(key, [c]);
  }
  let total = 0;
  for (const rows of byMonth.values()) {
    total += sumKgForMonthRows(rows);
  }
  return total;
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

export type FeedAvailableKgEstimate = {
  /** Saldo visual estimado al día de hoy; nunca negativo. */
  estimatedKg: number;
  /** Consumo estimado para períodos sin declaración mensual cerrada. */
  projectedConsumedKg: number;
  /** Consumo mensual real que reemplazó la proyección de sus meses. */
  declaredConsumedKg: number;
  /** Fecha desde la que comenzó la proyección visual. */
  projectionStartYmd: string | null;
};

/**
 * Estima el alimento disponible hoy sin escribir ni alterar el saldo contable.
 *
 * Las declaraciones mensuales cerradas sustituyen la quema estimada de todo
 * su mes. Los días de meses sin declaración (incluido el mes en curso) usan
 * la tasa diaria estimada. Así una compra nueva suma al saldo real estimado,
 * pero no reinicia artificialmente el consumo de compras anteriores.
 */
export function estimateFeedAvailableKgToday(input: {
  baseline?: { date: string; stockKg: number } | null;
  purchases: Array<{ date: string; kg: number }>;
  consumptions: FeedConsumptionMonthly[];
  gramsPerHenDay: number;
  activeHens: number;
  now?: Date;
}): FeedAvailableKgEstimate {
  const now = input.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayYmd = localDateToYmd(today);
  const baselineDate = String(input.baseline?.date ?? '').slice(0, 10);
  const hasBaseline = /^\d{4}-\d{2}-\d{2}$/.test(baselineDate);

  const purchases = input.purchases
    .map((purchase) => ({
      date: String(purchase.date ?? '').slice(0, 10),
      kg: Math.max(0, Number(purchase.kg) || 0),
    }))
    .filter(
      (purchase) =>
        purchase.kg > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(purchase.date) &&
        purchase.date <= todayYmd &&
        (!hasBaseline || purchase.date >= baselineDate)
    );

  const firstPurchaseDate = purchases.map((purchase) => purchase.date).sort()[0] ?? null;
  const projectionStartYmd = hasBaseline ? baselineDate : firstPurchaseDate;
  if (!projectionStartYmd || projectionStartYmd > todayYmd) {
    return {
      estimatedKg: Math.max(0, Number(input.baseline?.stockKg) || 0),
      projectedConsumedKg: 0,
      declaredConsumedKg: 0,
      projectionStartYmd: projectionStartYmd ?? null,
    };
  }

  const declaredByMonth = new Map<string, FeedConsumptionMonthly[]>();
  for (const consumption of input.consumptions) {
    const monthEnd = lastDayOfMonthYmd(consumption.year, consumption.month);
    const monthStart = `${consumption.year}-${String(consumption.month).padStart(2, '0')}-01`;
    // Un mes solo queda corregido por el dato real una vez que terminó.
    // Si una apertura ocurre a mitad de mes, no se puede separar el consumo
    // previo a la apertura; se conserva la proyección para evitar sobrerrestar.
    if (
      monthEnd > todayYmd ||
      monthStart < projectionStartYmd ||
      (Number(consumption.kg_consumed) || 0) <= 0
    ) {
      continue;
    }
    const key = monthKey(consumption.year, consumption.month);
    const rows = declaredByMonth.get(key);
    if (rows) rows.push(consumption);
    else declaredByMonth.set(key, [consumption]);
  }

  let declaredConsumedKg = 0;
  for (const rows of declaredByMonth.values()) {
    declaredConsumedKg += sumKgForMonthRows(rows);
  }

  const declaredMonthKeys = new Set(declaredByMonth.keys());
  let projectedDays = 0;
  const cursor = parseLocalYmd(projectionStartYmd)!;
  while (cursor < today) {
    const key = monthKey(cursor.getFullYear(), cursor.getMonth() + 1);
    if (!declaredMonthKeys.has(key)) projectedDays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  const dailyKg = (Math.max(0, Number(input.gramsPerHenDay) || 0) *
    Math.max(0, Math.floor(Number(input.activeHens) || 0))) /
    1000;
  const projectedConsumedKg = dailyKg > 0 ? projectedDays * dailyKg : 0;
  const purchasedKg = purchases.reduce((sum, purchase) => sum + purchase.kg, 0);
  const baselineKg = hasBaseline ? Math.max(0, Number(input.baseline?.stockKg) || 0) : 0;

  return {
    estimatedKg: Math.max(0, baselineKg + purchasedKg - declaredConsumedKg - projectedConsumedKg),
    projectedConsumedKg,
    declaredConsumedKg,
    projectionStartYmd,
  };
}

/** Días restantes → etiquetas; la fecha límite debe venir anclada (no recalcular desde hoy). */
export function formatFeedReachFromToday(
  daysRemaining: number,
  untilDateYmd?: string | null
): { daysLabel: string; untilLabel: string } {
  const days = Math.max(0, Number(daysRemaining) || 0);
  const untilLabel = untilDateYmd
    ? formatYmdEsAr(untilDateYmd)
    : formatYmdEsAr(addFractionalDaysToYmd(localDateToYmd(new Date()), days));
  return { daysLabel: days.toFixed(1), untilLabel };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseLocalYmd(ymd: string): Date | null {
  const m = String(ymd ?? '')
    .trim()
    .slice(0, 10)
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function localDateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatYmdEsAr(ymd: string): string {
  const dt = parseLocalYmd(ymd);
  if (!dt) return ymd;
  return dt.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Último día del mes calendario (month 1–12) como YYYY-MM-DD. */
export function lastDayOfMonthYmd(year: number, month: number): string {
  const dt = new Date(year, month, 0);
  return localDateToYmd(dt);
}

export function maxYmd(...dates: Array<string | null | undefined>): string | null {
  const valid = dates
    .map((d) => String(d ?? '').trim().slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) return null;
  return valid.sort()[valid.length - 1] ?? null;
}

/**
 * Ancla del alcance de alimento: el más reciente entre línea base,
 * última compra (Alimento) y fin del último mes con consumo declarado.
 */
export function resolveFeedReachAnchorDate(input: {
  baselineDate?: string | null;
  purchaseDates?: string[];
  consumptions?: Array<{ year: number; month: number; kg_consumed?: number }>;
  /** Si hay baseline, solo cuentan eventos desde esa fecha (inclusive). */
  cutoffYmd?: string | null;
}): string | null {
  const cutoff = input.cutoffYmd ? String(input.cutoffYmd).slice(0, 10) : null;
  const purchases = (input.purchaseDates ?? [])
    .map((d) => String(d ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter((d) => !cutoff || dateOnOrAfter(d, cutoff));

  let lastConsumptionEnd: string | null = null;
  for (const c of input.consumptions ?? []) {
    if ((Number(c.kg_consumed) || 0) <= 0) continue;
    if (cutoff && !yearMonthOnOrAfter(c.year, c.month, cutoff)) continue;
    const end = lastDayOfMonthYmd(c.year, c.month);
    if (!lastConsumptionEnd || end > lastConsumptionEnd) lastConsumptionEnd = end;
  }

  return maxYmd(input.baselineDate, ...purchases, lastConsumptionEnd);
}

/** Suma días (fracción OK) a una fecha local YYYY-MM-DD → YYYY-MM-DD del momento resultante. */
export function addFractionalDaysToYmd(ymd: string, days: number): string {
  const base = parseLocalYmd(ymd);
  if (!base) return String(ymd).slice(0, 10);
  const ms = base.getTime() + Math.max(0, Number(days) || 0) * MS_PER_DAY;
  return localDateToYmd(new Date(ms));
}

/**
 * Días restantes desde `now` hasta el agotamiento estimado:
 * until = anchor + (stock / consumo_diario); days = until − hoy.
 */
export function daysRemainingFromAnchor(
  stockKg: number,
  gramsPerHenDay: number,
  activeHens: number,
  anchorDateYmd: string,
  now: Date = new Date()
): { daysRemaining: number; untilDateYmd: string; spanDays: number } | null {
  const spanDays = estimateDaysFromFeedKg(stockKg, gramsPerHenDay, activeHens);
  if (spanDays == null) return null;
  const anchor = parseLocalYmd(anchorDateYmd);
  if (!anchor) return null;
  const untilMs = anchor.getTime() + spanDays * MS_PER_DAY;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysRemaining = Math.max(0, (untilMs - today.getTime()) / MS_PER_DAY);
  return {
    daysRemaining,
    untilDateYmd: localDateToYmd(new Date(untilMs)),
    spanDays,
  };
}

/**
 * Días restantes estimados:
 * consumo_diario_kg = (g/ave/día * aves_activas) / 1000
 * span = stock_kg / consumo_diario_kg (desde el ancla)
 * fecha_limite = ancla + span
 * días_restantes = fecha_limite − hoy
 *
 * g/ave/día = promedio de meses cerrados; si no hay, DEFAULT_FEED_GRAMS_PER_HEN_DAY.
 */
export function estimateFeedDaysRemaining(
  stockKg: number,
  consumptions: FeedConsumptionMonthly[],
  activeHens: number,
  now: Date = new Date(),
  maxClosedMonths = 3,
  anchorDateYmd: string | null = null
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
  const anchor =
    anchorDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(String(anchorDateYmd).slice(0, 10))
      ? String(anchorDateYmd).slice(0, 10)
      : localDateToYmd(now);

  if (!Number.isFinite(stockKg) || stockKg <= 0) {
    return {
      daysRemaining: stockKg <= 0 ? 0 : null,
      untilDateYmd: stockKg <= 0 ? anchor : null,
      anchorDateYmd: anchor,
      gramsPerHenDay,
      gramsSource,
      activeHens: hens,
    };
  }

  const reach = daysRemainingFromAnchor(stockKg, gramsPerHenDay, hens, anchor, now);
  if (!reach) {
    return {
      daysRemaining: null,
      untilDateYmd: null,
      anchorDateYmd: anchor,
      gramsPerHenDay,
      gramsSource,
      activeHens: hens,
    };
  }

  return {
    daysRemaining: reach.daysRemaining,
    untilDateYmd: reach.untilDateYmd,
    anchorDateYmd: anchor,
    gramsPerHenDay,
    gramsSource,
    activeHens: hens,
  };
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
