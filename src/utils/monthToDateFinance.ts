import type { Expense, Sale } from '../types';

export function todayLocalYmd(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonthStartLocalYmd(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
}

/**
 * Total ventas − total gastos.
 * `sales` y `expenses` deben estar ya acotados al mes (p. ej. con `getAllRange` del 1 al hoy);
 * los parámetros de fechas se conservan por compatibilidad con el llamador y no se usan para filtrar.
 */
export function computeMonthToDateTotals(
  sales: Sale[],
  expenses: Expense[],
  _monthStartYmd: string,
  _todayYmd: string
): { ventasDelMes: number; gastosDelMes: number; netoDelMes: number; gananciaDelMes: number } {
  const ventasDelMes = sales.reduce((sum, s) => sum + (Number(s.total_price) || 0), 0);
  const gastosDelMes = expenses.reduce((sum, e) => sum + (Number(e.total_price) || 0), 0);
  const gananciaDelMes = ventasDelMes - gastosDelMes;
  return {
    ventasDelMes,
    gastosDelMes,
    netoDelMes: gananciaDelMes,
    gananciaDelMes,
  };
}
