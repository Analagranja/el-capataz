/**
 * Tests kg expenses + form numbers.
 * npx --yes tsx@4.19.2 src/services/expenseQuantity.test.ts
 */
import assert from 'node:assert/strict';
import { expenseQuantityWritePayload, resolveExpenseQuantityKg } from './expenseQuantity';
import { numberInputValue, parseFormFloat } from '../utils/formNumbers';

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}`);
    throw e;
  }
}

check('write payload llena quantity_kg y quantity', () => {
  assert.deepEqual(expenseQuantityWritePayload(75), { quantity_kg: 75, quantity: 75 });
});

check('read: quantity_kg=0 pero quantity=75 → 75', () => {
  assert.equal(resolveExpenseQuantityKg({ quantity_kg: 0, quantity: 75 }), 75);
});

check('read: quantity_kg=75 gana', () => {
  assert.equal(resolveExpenseQuantityKg({ quantity_kg: 75, quantity: 0 }), 75);
});

check('numberInputValue: 0 → vacío (evita 019500)', () => {
  assert.equal(numberInputValue(0), '');
  assert.equal(numberInputValue(19500), 19500);
});

check('parseFormFloat de 019500', () => {
  assert.equal(parseFormFloat('019500', 0), 19500);
});

console.log(`\n${passed} tests passed`);
