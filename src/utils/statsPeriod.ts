/** Calendario local YYYY-MM-DD */
export function ymdFromParts(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function todayLocalYmdParts(now: Date = new Date()): { y: number; m: number; d: number; ymd: string } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return { y, m, d, ymd: ymdFromParts(y, m, d) };
}

/**
 * Día calendario local siguiente a `ymd` (prefijo YYYY-MM-DD).
 * Sirve para consultas `col >= fromYmd AND col < addOneLocalCalendarDayYmd(toYmd)` e incluir
 * todo el último día aunque la columna sea `timestamp`/`timestamptz`.
 */
export function addOneLocalCalendarDayYmd(ymd: string): string {
  const head = String(ymd ?? '')
    .trim()
    .slice(0, 10);
  const [ys, ms, ds] = head.split('-');
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    throw new Error(`addOneLocalCalendarDayYmd: fecha inválida (${ymd})`);
  }
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + 1);
  return ymdFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Días inclusivos entre dos fechas locales YYYY-MM-DD (mismo día → 1). */
export function inclusiveLocalDaysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toYmd.slice(0, 10).split('-').map(Number);
  const a = new Date(fy, fm - 1, fd);
  const b = new Date(ty, tm - 1, td);
  const diff = Math.floor((b.getTime() - a.getTime()) / 86400000);
  return Math.max(0, diff + 1);
}

export interface StatsPeriodBounds {
  fromYmd: string;
  toYmd: string;
  /** Días del período para métricas diarias (consumo/ave); 0 si el período es inválido o futuro */
  dayCount: number;
}

/**
 * Período acotado al filtro Año / Mes de Estadísticas.
 * La fecha fin nunca supera "hoy" si el período llega al presente.
 */
export function boundsForYearMonthFilter(
  activeYear: string,
  selectedMonth: string,
  now: Date = new Date()
): StatsPeriodBounds {
  const y = Number(activeYear);
  const { y: cy, m: cm, d: cd, ymd: todayYmd } = todayLocalYmdParts(now);
  const pad = (n: number) => String(n).padStart(2, '0');

  if (!Number.isFinite(y)) {
    return { fromYmd: todayYmd, toYmd: todayYmd, dayCount: 1 };
  }

  if (selectedMonth) {
    const m = Number(selectedMonth);
    if (!Number.isFinite(m) || m < 1 || m > 12) {
      return { fromYmd: todayYmd, toYmd: todayYmd, dayCount: 1 };
    }
    const fromYmd = `${y}-${pad(m)}-01`;
    const lastD = new Date(y, m, 0).getDate();
    const monthEndYmd = `${y}-${pad(m)}-${pad(lastD)}`;

    if (y > cy || (y === cy && m > cm)) {
      return { fromYmd, toYmd: fromYmd, dayCount: 0 };
    }

    let toYmd = monthEndYmd;
    if (toYmd > todayYmd) toYmd = todayYmd;
    if (fromYmd > toYmd) {
      return { fromYmd, toYmd: fromYmd, dayCount: 0 };
    }
    return {
      fromYmd,
      toYmd,
      dayCount: inclusiveLocalDaysBetween(fromYmd, toYmd),
    };
  }

  const fromYmd = `${y}-01-01`;
  let toYmd = `${y}-12-31`;

  if (y > cy) {
    return { fromYmd, toYmd: fromYmd, dayCount: 0 };
  }
  if (y === cy) {
    toYmd = todayYmd < toYmd ? todayYmd : toYmd;
  }

  if (fromYmd > toYmd) {
    return { fromYmd, toYmd: fromYmd, dayCount: 0 };
  }

  return {
    fromYmd,
    toYmd,
    dayCount: inclusiveLocalDaysBetween(fromYmd, toYmd),
  };
}

/** Rango [01-01 .. 31-12] del año, o hasta hoy si es el año en curso */
export function boundsForCalendarYear(year: number, now: Date = new Date()): StatsPeriodBounds {
  return boundsForYearMonthFilter(String(year), '', now);
}
