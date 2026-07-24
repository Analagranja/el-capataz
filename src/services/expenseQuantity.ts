/**
 * Lectura/escritura de kg de expenses (quantity_kg + legacy quantity).
 * Extraído para tests: el bug de prod era escribir solo `quantity` y dejar
 * quantity_kg en DEFAULT 0; la UI leía quantity_kg y mostraba 0.00 kg.
 */

/** Preferir el valor > 0 entre quantity_kg y quantity (legacy). */
export function resolveExpenseQuantityKg(row: Record<string, unknown>): number {
  const qtyKg = row.quantity_kg != null ? Number(row.quantity_kg) : NaN;
  const qty = row.quantity != null ? Number(row.quantity) : NaN;
  const a = Number.isFinite(qtyKg) ? qtyKg : null;
  const b = Number.isFinite(qty) ? qty : null;
  if (a != null && a > 0) return a;
  if (b != null && b > 0) return b;
  if (a != null) return a;
  if (b != null) return b;
  return 0;
}

/** Escribe kg en ambas columnas para no dejar quantity_kg en 0 por default. */
export function expenseQuantityWritePayload(quantityKg: number): {
  quantity_kg: number;
  quantity: number;
} {
  const n = Number(quantityKg);
  const safe = Number.isFinite(n) && n >= 0 ? n : 0;
  return {
    quantity_kg: safe,
    quantity: safe,
  };
}
