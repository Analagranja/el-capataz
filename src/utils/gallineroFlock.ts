/** Edad y fase de postura a partir de birth_date (YYYY-MM-DD, calendario local). */
export type FlockLayingPhase = 'sin_datos' | 'pre_postura' | 'iniciando_postura' | 'en_postura';

export const FLOCK_PHASE_LABEL: Record<FlockLayingPhase, string> = {
  sin_datos: 'Sin datos',
  pre_postura: 'Pre-postura',
  iniciando_postura: 'Iniciando postura',
  en_postura: 'En postura',
};

function parseYmdLocal(ymd: string): Date | null {
  const m = String(ymd).trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(y, mo - 1, d);
}

/** Semanas completas desde birth_date hasta hoy (local). */
export function flockAgeWeeksFromBirthDate(birthDateYmd: string | null | undefined, now = new Date()): number | null {
  const birth = birthDateYmd ? parseYmdLocal(birthDateYmd) : null;
  if (!birth) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - birth.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (7 * 86400000));
}

export function flockLayingPhaseFromWeeks(weeks: number | null): FlockLayingPhase {
  if (weeks === null) return 'sin_datos';
  if (weeks < 18) return 'pre_postura';
  if (weeks <= 20) return 'iniciando_postura';
  return 'en_postura';
}

export function flockAgeSummary(birthDateYmd: string | null | undefined): {
  weeks: number | null;
  phase: FlockLayingPhase;
  phaseLabel: string;
  shortLine: string | null;
} {
  const weeks = flockAgeWeeksFromBirthDate(birthDateYmd);
  const phase = flockLayingPhaseFromWeeks(weeks);
  const phaseLabel = FLOCK_PHASE_LABEL[phase];
  if (weeks === null) {
    return { weeks: null, phase, phaseLabel, shortLine: null };
  }
  return {
    weeks,
    phase,
    phaseLabel,
    shortLine: `${weeks} semanas · ${phaseLabel.toLowerCase()}`,
  };
}
