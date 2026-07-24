/**
 * Helpers compartidos para inputs numéricos controlados.
 * Evita el patrón "0" + tipeo → "019500" y NaN al parsear.
 */

export function parseFormFloat(raw: string, fallback = 0): number {
  if (raw.trim() === '') return fallback;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function parseFormInt(raw: string, fallback = 0): number {
  if (raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function safeFormNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Valor para <input type="number"> controlado.
 * Si es 0, devolvemos '' para que el usuario no tipeé delante del cero inicial.
 */
export function numberInputValue(value: unknown): string | number {
  const n = safeFormNumber(value, NaN);
  if (!Number.isFinite(n) || n === 0) return '';
  return n;
}
