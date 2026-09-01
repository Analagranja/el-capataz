/**
 * Mutua exclusión org vs por-gallinero.
 * Ejecutar: npx --yes tsx src/utils/feedConsumptionScope.test.ts
 */
import assert from 'node:assert/strict';
import { feedConsumptionScopeConflict } from './feedConsumptionScope';
import type { FeedConsumptionMonthly } from '../types';

function row(
  id: string,
  gallineroId: string | null,
  kg = 100
): FeedConsumptionMonthly {
  return {
    id,
    organization_id: 'org',
    gallinero_id: gallineroId,
    year: 2026,
    month: 7,
    kg_consumed: kg,
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
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

check('sin filas → sin conflicto', () => {
  assert.equal(feedConsumptionScopeConflict(null, []), null);
  assert.equal(feedConsumptionScopeConflict('g1', []), null);
});

check('org con gallineros existentes → bloquea', () => {
  const msg = feedConsumptionScopeConflict(null, [row('g1', 'g1')]);
  assert.match(msg ?? '', /por gallinero/i);
});

check('gallinero con org existente → bloquea', () => {
  const msg = feedConsumptionScopeConflict('g2', [row('org', null)]);
  assert.match(msg ?? '', /toda la granja/i);
});

check('editar fila propia no cuenta como conflicto', () => {
  assert.equal(feedConsumptionScopeConflict('g1', [row('g1', 'g1')], 'g1'), null);
  assert.equal(feedConsumptionScopeConflict(null, [row('org', null)], 'org'), null);
});

console.log(`\n${passed} tests passed`);
if (!process.exitCode) console.log('All feed scope tests OK');
