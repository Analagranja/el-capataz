/**
 * Agrupación de cuenta corriente.
 * Ejecutar: npx --yes tsx src/utils/unpaidSales.test.ts
 */
import assert from 'node:assert/strict';
import type { Sale } from '../types';
import {
  UNASSIGNED_CUSTOMER_LABEL,
  groupUnpaidSalesByCustomer,
  unpaidGrandTotal,
} from './unpaidSales';

function sale(partial: Partial<Sale> & Pick<Sale, 'id' | 'is_paid' | 'total_price'>): Sale {
  return {
    organization_id: 'org',
    date: '2026-09-01',
    type: 'docena',
    quantity: 1,
    price_per_unit: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    ...partial,
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

check('pagadas no entran', () => {
  const groups = groupUnpaidSalesByCustomer([
    sale({ id: '1', is_paid: true, total_price: 100, customer_id: 'a', customer_name: 'Ana' }),
  ]);
  assert.equal(groups.length, 0);
});

check('agrupa por customer_id y suma total_price', () => {
  const groups = groupUnpaidSalesByCustomer([
    sale({ id: '1', is_paid: false, total_price: 100, customer_id: 'a', customer_name: 'Ana' }),
    sale({ id: '2', is_paid: false, total_price: 50.5, customer_id: 'a', customer_name: 'Ana' }),
    sale({ id: '3', is_paid: false, total_price: 20, customer_id: 'b', customer_name: 'Beto' }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].customerName, 'Ana');
  assert.equal(groups[0].totalOwed, 150.5);
  assert.equal(groups[0].sales.length, 2);
  assert.equal(groups[1].customerName, 'Beto');
  assert.equal(groups[1].totalOwed, 20);
});

check('Sin cliente asociado queda aparte y no se mezcla', () => {
  const groups = groupUnpaidSalesByCustomer([
    sale({ id: '1', is_paid: false, total_price: 10, customer_id: 'a', customer_name: 'Ana' }),
    sale({ id: '2', is_paid: false, total_price: 7, customer_id: null, customer_name: '' }),
    sale({ id: '3', is_paid: false, total_price: 3, customer_id: '', customer_name: 'Ana' }),
  ]);
  assert.equal(groups.length, 2);
  const ana = groups.find((g) => g.customerId === 'a');
  const none = groups.find((g) => g.customerId == null);
  assert.ok(ana);
  assert.ok(none);
  assert.equal(ana?.totalOwed, 10);
  assert.equal(none?.customerName, UNASSIGNED_CUSTOMER_LABEL);
  assert.equal(none?.totalOwed, 10);
  assert.equal(none?.sales.length, 2);
  assert.equal(groups[groups.length - 1].customerId, null);
});

check('gran total usa total_price', () => {
  const groups = groupUnpaidSalesByCustomer([
    sale({ id: '1', is_paid: false, total_price: 100, customer_id: 'a', customer_name: 'Ana' }),
    sale({ id: '2', is_paid: false, total_price: 5, customer_id: null }),
  ]);
  assert.equal(unpaidGrandTotal(groups), 105);
});

check('marcar pagada después saca la venta y rebaja el total', () => {
  const before = [
    sale({ id: '1', is_paid: false, total_price: 100, customer_id: 'a', customer_name: 'Ana' }),
    sale({ id: '2', is_paid: false, total_price: 40, customer_id: 'a', customer_name: 'Ana' }),
    sale({ id: '3', is_paid: false, total_price: 7, customer_id: null }),
  ];
  assert.equal(unpaidGrandTotal(groupUnpaidSalesByCustomer(before)), 147);
  const after = before.map((s) => (s.id === '2' ? { ...s, is_paid: true } : s));
  const groups = groupUnpaidSalesByCustomer(after);
  const ana = groups.find((g) => g.customerId === 'a');
  const none = groups.find((g) => g.customerId == null);
  assert.equal(ana?.totalOwed, 100);
  assert.equal(ana?.sales.length, 1);
  assert.equal(none?.totalOwed, 7);
  assert.equal(unpaidGrandTotal(groups), 107);
});

if (!process.exitCode) {
  console.log(`OK  ${passed} tests`);
}
