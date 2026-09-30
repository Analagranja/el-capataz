import type { Sale } from '../types';

export const UNASSIGNED_CUSTOMER_LABEL = 'Sin cliente asociado';
const UNASSIGNED_KEY = '__unassigned__';

export type UnpaidAccountGroup = {
  key: string;
  customerId: string | null;
  customerName: string;
  totalOwed: number;
  sales: Sale[];
};

function resolvedCustomerId(sale: Sale): string | null {
  const id = sale.customer_id?.trim();
  return id ? id : null;
}

/** Agrupa ventas no pagadas por cliente. `customer_id` nulo no se mezcla con clientes reales. */
export function groupUnpaidSalesByCustomer(sales: Sale[]): UnpaidAccountGroup[] {
  const groups = new Map<string, UnpaidAccountGroup>();

  for (const sale of sales) {
    if (sale.is_paid) continue;
    const customerId = resolvedCustomerId(sale);
    const key = customerId ?? UNASSIGNED_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        customerId,
        customerName: customerId
          ? sale.customer_name?.trim() || 'Cliente'
          : UNASSIGNED_CUSTOMER_LABEL,
        totalOwed: 0,
        sales: [],
      };
      groups.set(key, group);
    }
    group.sales.push(sale);
    group.totalOwed += Number(sale.total_price) || 0;
  }

  const named = [...groups.values()]
    .filter((g) => g.customerId != null)
    .sort((a, b) => a.customerName.localeCompare(b.customerName, 'es'));
  const unassigned = [...groups.values()].filter((g) => g.customerId == null);
  return [...named, ...unassigned];
}

export function unpaidGrandTotal(groups: UnpaidAccountGroup[]): number {
  return groups.reduce((sum, g) => sum + g.totalOwed, 0);
}
