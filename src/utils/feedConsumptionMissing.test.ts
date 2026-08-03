/**
 * Tests: meses de consumo faltantes.
 * Ejecutar: npx --yes tsx@4.19.2 src/utils/feedConsumptionMissing.test.ts
 */
import assert from 'node:assert/strict';
import {
  closedMonthsForOrganization,
  closedMonthsLookingBack,
  findMissingFeedMonths,
  formatYearMonthLabel,
} from './feedConsumptionMissing';

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

check('closedMonthsLookingBack excluye mes en curso', () => {
  const now = new Date(2026, 7, 3); // 3 ago 2026
  const months = closedMonthsLookingBack(now, 6);
  assert.equal(months.length, 6);
  assert.deepEqual(months[0], { year: 2026, month: 7 }); // julio
  assert.deepEqual(months[5], { year: 2026, month: 2 }); // febrero
});

check('org creada este mes: sin meses a revisar', () => {
  const now = new Date(2026, 6, 23); // 23 jul 2026
  const months = closedMonthsForOrganization(now, '2026-07-15T12:00:00.000Z', 6);
  assert.deepEqual(months, []);
});

check('org creada en julio, hoy agosto: solo julio', () => {
  const now = new Date(2026, 7, 5); // 5 ago 2026
  const months = closedMonthsForOrganization(now, '2026-07-15T12:00:00.000Z', 6);
  assert.deepEqual(months, [{ year: 2026, month: 7 }]);
});

check('org vieja: tope 6 meses hacia atrás', () => {
  const now = new Date(2026, 7, 5); // 5 ago 2026
  const months = closedMonthsForOrganization(now, '2020-01-01T00:00:00.000Z', 6);
  assert.equal(months.length, 6);
  assert.deepEqual(months[0], { year: 2026, month: 7 });
  assert.deepEqual(months[5], { year: 2026, month: 2 });
});

check('findMissingFeedMonths ignora kg 0 y cubre con cualquier fila', () => {
  const closed = [
    { year: 2026, month: 7 },
    { year: 2026, month: 6 },
    { year: 2026, month: 5 },
  ];
  const missing = findMissingFeedMonths(closed, [
    { year: 2026, month: 6, kg_consumed: 100 },
    { year: 2026, month: 5, kg_consumed: 0 },
    { year: 2026, month: 7, kg_consumed: 0 },
  ]);
  assert.deepEqual(missing, [
    { year: 2026, month: 7 },
    { year: 2026, month: 5 },
  ]);
});

check('formatYearMonthLabel', () => {
  assert.equal(formatYearMonthLabel({ year: 2026, month: 7 }), 'Julio 2026');
});

console.log(`\n${passed} tests passed`);
