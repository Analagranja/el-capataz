/** Peso argentino (solo presentación). */
export function formatArs(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
