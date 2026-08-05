/**
 * Tests costo de producción (Estadísticas).
 * Ejecutar: npx --yes tsx src/utils/productionCost.test.ts
 */
import assert from 'node:assert/strict';
import type { Expense, FeedConsumptionMonthly, Sale } from '../types';
import {
  computeMonthProductionCost,
  computePeriodProductionCost,
  normalizeAmortizationMonths,
  otherAmortizedCostInMonth,
  weightedAvgFeedCostPerKg,
  weightedAvgPackagingCostByItem,
} from './productionCost';

function expense(partial: Partial<Expense> & Pick<Expense, 'description' | 'date' | 'total_price'>): Expense {
  return {
    id: partial.id ?? `e-${partial.date}-${partial.description}`,
    organization_id: 'org',
    date: partial.date,
    description: partial.description,
    quantity_kg: partial.quantity_kg ?? 0,
    packaging_quantity: partial.packaging_quantity ?? null,
    packaging_item_key: partial.packaging_item_key ?? null,
    total_price: partial.total_price,
    amortization_months: partial.amortization_months ?? 1,
    created_at: `${partial.date}T12:00:00.000Z`,
  };
}

function sale(type: Sale['type'], quantity: number, date: string): Sale {
  return {
    id: `s-${type}-${quantity}-${date}`,
    organization_id: 'org',
    customer_id: null,
    date,
    type,
    quantity,
    price_per_unit: 1,
    total_price: quantity,
    notes: '',
    created_at: `${date}T12:00:00.000Z`,
  };
}

function consumption(year: number, month: number, kg: number): FeedConsumptionMonthly {
  return {
    id: `c-${year}-${month}`,
    organization_id: 'org',
    gallinero_id: null,
    year,
    month,
    kg_consumed: kg,
    notes: null,
    hens_snapshot: 100,
    created_at: '',
    updated_at: '',
  };
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

check('normalizeAmortizationMonths', () => {
  assert.equal(normalizeAmortizationMonths(undefined), 1);
  assert.equal(normalizeAmortizationMonths(0), 1);
  assert.equal(normalizeAmortizationMonths(3), 3);
  assert.equal(normalizeAmortizationMonths(99), 60);
});

check('promedio alimento solo compras ≤ fin de mes', () => {
  const expenses = [
    expense({ description: 'Alimento', date: '2026-06-10', quantity_kg: 100, total_price: 10000 }),
    expense({ description: 'Alimento', date: '2026-08-01', quantity_kg: 100, total_price: 20000 }),
  ];
  // Fin julio: solo la de junio → 100 $/kg
  assert.equal(weightedAvgFeedCostPerKg(expenses, '2026-07-31'), 100);
  // Fin agosto: ambas → 150 $/kg
  assert.equal(weightedAvgFeedCostPerKg(expenses, '2026-08-31'), 150);
});

check('promedio maples por ítem', () => {
  const expenses = [
    expense({
      description: 'Maples / Packaging',
      date: '2026-07-01',
      packaging_quantity: 240,
      packaging_item_key: 'media_docena',
      total_price: 81000,
    }),
  ];
  const avg = weightedAvgPackagingCostByItem(expenses, '2026-07-31');
  assert.equal(avg.media_docena, 81000 / 240);
  assert.equal(avg.maple, null);
});

check('julio: estuches media docena por uso no por compra', () => {
  const expenses = [
    expense({
      description: 'Maples / Packaging',
      date: '2026-07-05',
      packaging_quantity: 240,
      packaging_item_key: 'media_docena',
      total_price: 81000,
    }),
  ];
  const sales = [sale('media_docena', 40, '2026-07-20')];
  const month = computeMonthProductionCost(2026, 7, expenses, sales, []);
  assert.equal(month.maples, 40 * (81000 / 240));
  assert.equal(month.alimento, 0);
  assert.equal(month.warnings.missingFeedConsumption, true);
});

check('alimento = avg × kg consumidos; sin declaración → 0 + warning', () => {
  const expenses = [
    expense({ description: 'Alimento', date: '2026-07-01', quantity_kg: 200, total_price: 40000 }),
  ];
  const withDecl = computeMonthProductionCost(
    2026,
    7,
    expenses,
    [],
    [consumption(2026, 7, 50)]
  );
  assert.equal(withDecl.alimento, 50 * 200);
  assert.equal(withDecl.warnings.missingFeedConsumption, false);

  const noDecl = computeMonthProductionCost(2026, 7, expenses, [], []);
  assert.equal(noDecl.alimento, 0);
  assert.equal(noDecl.warnings.missingFeedConsumption, true);
});

check('otros: prorrateo en N meses', () => {
  const expenses = [
    expense({
      description: 'Veterinario',
      date: '2026-07-15',
      total_price: 9000,
      amortization_months: 3,
    }),
  ];
  assert.equal(otherAmortizedCostInMonth(expenses, 2026, 7), 3000);
  assert.equal(otherAmortizedCostInMonth(expenses, 2026, 8), 3000);
  assert.equal(otherAmortizedCostInMonth(expenses, 2026, 9), 3000);
  assert.equal(otherAmortizedCostInMonth(expenses, 2026, 10), 0);
  assert.equal(otherAmortizedCostInMonth(expenses, 2026, 6), 0);
});

check('periodo suma meses', () => {
  const expenses = [
    expense({
      description: 'Transporte',
      date: '2026-07-01',
      total_price: 2000,
      amortization_months: 2,
    }),
  ];
  const period = computePeriodProductionCost(
    [
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ],
    expenses,
    [],
    []
  );
  assert.equal(period.otros, 2000);
  assert.equal(period.total, 2000);
});

check('sin cantidad en compra maples + ventas → 0 + warning', () => {
  const expenses = [
    expense({ description: 'Maples / Packaging', date: '2026-07-01', total_price: 5000 }),
  ];
  const month = computeMonthProductionCost(
    2026,
    7,
    expenses,
    [sale('maple', 2, '2026-07-10')],
    []
  );
  assert.equal(month.maples, 0);
  assert.equal(month.warnings.missingMapleUnitCost, true);
});

console.log(`\n${passed} tests passed`);
if (!process.exitCode) console.log('All productionCost tests OK');
