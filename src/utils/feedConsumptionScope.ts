import type { FeedConsumptionMonthly } from '../types';

function normalizeScopeGallineroId(gallineroId?: string | null): string | null {
  const id = String(gallineroId ?? '').trim();
  return id.length > 0 ? id : null;
}

/**
 * Mutua exclusión estricta org vs por-gallinero en el mismo mes.
 * Retorna mensaje de error o null si el alcance es válido.
 */
export function feedConsumptionScopeConflict(
  scopeGallineroId: string | null | undefined,
  monthRows: FeedConsumptionMonthly[],
  editingId?: string | null
): string | null {
  const scopeId = normalizeScopeGallineroId(scopeGallineroId);
  const others = editingId ? monthRows.filter((r) => r.id !== editingId) : monthRows;
  const hasOrg = others.some((r) => r.gallinero_id == null);
  const hasGallinero = others.some((r) => r.gallinero_id != null);

  if (scopeId === null && hasGallinero) {
    return 'Ya hay declaraciones por gallinero este mes. Completá o eliminá esas filas antes de declarar toda la granja.';
  }
  if (scopeId !== null && hasOrg) {
    return 'Ya hay una declaración de toda la granja este mes. Editá o eliminá esa declaración antes de cargar por gallinero.';
  }
  return null;
}
