import type { Gallinero } from '../types';

/** Reparte kg entre gallineros según proporción de `current_count`; ajusta redondeo al de más gallinas. */
export function distributeFeedKgByGallinero(
  totalKg: number,
  gallineros: Gallinero[]
): Array<{ gallineroId: string; kg: number }> {
  const eligible = gallineros.filter((g) => Math.max(0, Math.floor(Number(g.current_count) || 0)) > 0);
  const totalHens = eligible.reduce(
    (sum, g) => sum + Math.max(0, Math.floor(Number(g.current_count) || 0)),
    0
  );
  if (totalHens <= 0 || totalKg <= 0) return [];

  const rounded = eligible.map((g) => {
    const hens = Math.max(0, Math.floor(Number(g.current_count) || 0));
    const kg = Math.round(((totalKg * hens) / totalHens) * 100) / 100;
    return { gallineroId: g.id, kg };
  });

  const sumRounded = rounded.reduce((s, r) => s + r.kg, 0);
  const diff = Math.round((totalKg - sumRounded) * 100) / 100;
  if (diff !== 0 && rounded.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < eligible.length; i++) {
      const hensI = Math.max(0, Math.floor(Number(eligible[i].current_count) || 0));
      const hensMax = Math.max(0, Math.floor(Number(eligible[maxIdx].current_count) || 0));
      if (hensI > hensMax) maxIdx = i;
    }
    const targetId = eligible[maxIdx].id;
    const row = rounded.find((r) => r.gallineroId === targetId);
    if (row) row.kg = Math.round((row.kg + diff) * 100) / 100;
  }

  return rounded.filter((r) => r.kg > 0);
}
