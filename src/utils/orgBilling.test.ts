/**
 * Reloj de prueba / gracia / solo-lectura.
 * Ejecutar: npx --yes tsx src/utils/orgBilling.test.ts
 */
import assert from 'node:assert/strict';
import {
  deriveOrgBilling,
  isOrgReadOnly,
  subscriptionBannerCopy,
  writableUntil,
  type OrgBillingFields,
} from './orgBilling';

const NOW = new Date('2026-10-17T12:00:00.000Z');

function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function fields(partial: Partial<OrgBillingFields>): OrgBillingFields {
  return {
    is_paying_customer: false,
    paying_status_changed_at: null,
    trial_ends_at: null,
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

check('pagando → nunca readOnly', () => {
  const f = fields({
    is_paying_customer: true,
    trial_ends_at: isoDaysFromNow(-40),
    paying_status_changed_at: isoDaysFromNow(-40),
  });
  assert.equal(isOrgReadOnly(f, NOW), false);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'paying');
  assert.equal(s.daysRemainingUntilReadOnly, null);
  assert.equal(subscriptionBannerCopy(s), null);
});

check('trial activo (dentro de los 15 días) → no readOnly', () => {
  const f = fields({ trial_ends_at: isoDaysFromNow(8) });
  assert.equal(isOrgReadOnly(f, NOW), false);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'trial');
  assert.equal(s.trialDaysRemaining, 8);
  assert.equal(s.daysRemainingUntilReadOnly, 11);
  assert.match(subscriptionBannerCopy(s) ?? '', /Te quedan 8 días de prueba/);
});

check('trial vencido hace menos de 3 días → no readOnly (gracia)', () => {
  const f = fields({ trial_ends_at: isoDaysFromNow(-1) });
  assert.equal(isOrgReadOnly(f, NOW), false);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'grace');
  assert.equal(s.daysRemainingUntilReadOnly, 2);
  assert.match(subscriptionBannerCopy(s) ?? '', /En 2 días la cuenta pasa a solo lectura/);
});

check('trial vencido hace más de 3 días → readOnly', () => {
  const f = fields({ trial_ends_at: isoDaysFromNow(-4) });
  assert.equal(isOrgReadOnly(f, NOW), true);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'readonly');
  assert.equal(s.daysRemainingUntilReadOnly, 0);
  assert.equal(subscriptionBannerCopy(s), 'Solo lectura. Suscribite para volver a cargar datos.');
});

check('paying_status_changed_at reciente → no readOnly aunque el trial ya venció', () => {
  const f = fields({
    trial_ends_at: isoDaysFromNow(-20),
    paying_status_changed_at: isoDaysFromNow(-1),
  });
  assert.equal(isOrgReadOnly(f, NOW), false);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'grace');
  assert.equal(s.daysRemainingUntilReadOnly, 2);
  assert.equal(writableUntil(f, NOW)?.toISOString(), isoDaysFromNow(2));
});

check('paying_status_changed_at hace más de 3 días → readOnly', () => {
  const f = fields({ paying_status_changed_at: isoDaysFromNow(-4) });
  assert.equal(isOrgReadOnly(f, NOW), true);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'readonly');
  assert.match(subscriptionBannerCopy(s) ?? '', /Solo lectura/);
});

check('ambos NULL (org vieja, nunca tocada) → nunca readOnly', () => {
  const f = fields({});
  assert.equal(isOrgReadOnly(f, NOW), false);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'unstarted');
  assert.equal(s.daysRemainingUntilReadOnly, null);
  assert.equal(subscriptionBannerCopy(s), null);
});

check('carrera: trial activo + toggle reciente → gana el que vence primero (el toggle)', () => {
  const f = fields({
    trial_ends_at: isoDaysFromNow(10),
    paying_status_changed_at: isoDaysFromNow(-1),
  });
  assert.equal(isOrgReadOnly(f, NOW), false);
  const s = deriveOrgBilling(f, NOW);
  assert.equal(s.phase, 'grace');
  assert.equal(s.daysRemainingUntilReadOnly, 2);
  assert.equal(writableUntil(f, NOW)?.toISOString(), isoDaysFromNow(2));
  assert.match(subscriptionBannerCopy(s) ?? '', /En 2 días la cuenta pasa a solo lectura/);
});

check('banner: 1 día usa singular', () => {
  const trial = deriveOrgBilling(fields({ trial_ends_at: isoDaysFromNow(1) }), NOW);
  assert.match(subscriptionBannerCopy(trial) ?? '', /Te quedan 1 día de prueba/);
  const grace = deriveOrgBilling(fields({ trial_ends_at: isoDaysFromNow(-2) }), NOW);
  assert.match(subscriptionBannerCopy(grace) ?? '', /En 1 día la cuenta pasa a solo lectura/);
});

if (!process.exitCode) {
  console.log(`OK  ${passed} tests`);
}
