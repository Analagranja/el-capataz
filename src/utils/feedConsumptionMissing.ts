/** Año-mes (month 1–12). */
export type YearMonth = { year: number; month: number };

const MONTH_LABELS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Últimos `count` meses CERRADOS (excluye el mes en curso), más reciente primero. */
export function closedMonthsLookingBack(now: Date, count: number): YearMonth[] {
  const result: YearMonth[] = [];
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-based; retrocedemos al mes anterior
  for (let i = 0; i < count; i++) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    result.push({ year: y, month: m + 1 });
  }
  return result;
}

/** Mes de alta de la org a partir de created_at (prefiero YYYY-MM del ISO). */
export function yearMonthFromCreatedAt(createdAt: string | Date | null | undefined): YearMonth | null {
  if (createdAt == null) return null;
  if (typeof createdAt === 'string') {
    const match = createdAt.trim().match(/^(\d{4})-(\d{2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (year > 0 && month >= 1 && month <= 12) return { year, month };
    }
  }
  const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function isYearMonthOnOrAfter(ym: YearMonth, start: YearMonth): boolean {
  if (ym.year > start.year) return true;
  if (ym.year < start.year) return false;
  return ym.month >= start.month;
}

/**
 * Meses cerrados a revisar para el recordatorio:
 * desde el mes de alta de la org hasta el mes pasado, tope `maxCount` (más reciente primero).
 * Si la org se creó este mes → [].
 */
export function closedMonthsForOrganization(
  now: Date,
  orgCreatedAt: string | Date | null | undefined,
  maxCount = 6
): YearMonth[] {
  const start = yearMonthFromCreatedAt(orgCreatedAt);
  const candidates = closedMonthsLookingBack(now, maxCount);
  if (!start) return candidates;
  return candidates.filter((ym) => isYearMonthOnOrAfter(ym, start));
}

export function yearMonthKey(ym: YearMonth): string {
  return `${ym.year}-${ym.month}`;
}

/**
 * Meses cerrados sin ninguna declaración con kg > 0.
 * `declared` puede incluir filas por gallinero; basta una con kg>0 para el mes.
 */
export function findMissingFeedMonths(
  closedMonths: YearMonth[],
  declared: Array<{ year: number; month: number; kg_consumed?: number }>
): YearMonth[] {
  const covered = new Set<string>();
  for (const row of declared) {
    if ((Number(row.kg_consumed) || 0) > 0) {
      covered.add(yearMonthKey({ year: Number(row.year), month: Number(row.month) }));
    }
  }
  return closedMonths.filter((m) => !covered.has(yearMonthKey(m)));
}

export function formatYearMonthLabel(ym: YearMonth): string {
  const name = MONTH_LABELS_ES[ym.month - 1] ?? String(ym.month);
  return `${name} ${ym.year}`;
}

export function formatYearMonthList(months: YearMonth[]): string {
  return months.map(formatYearMonthLabel).join(', ');
}
