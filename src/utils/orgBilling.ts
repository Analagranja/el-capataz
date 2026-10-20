export const TRIAL_DAYS = 15;
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingPhase = 'paying' | 'trial' | 'grace' | 'unstarted' | 'readonly';

export type OrgBillingFields = {
  is_paying_customer: boolean;
  paying_status_changed_at: string | null;
  trial_ends_at: string | null;
};

export type OrgBillingStatus = {
  phase: BillingPhase;
  isReadOnly: boolean;
  daysRemainingUntilReadOnly: number | null;
  trialDaysRemaining: number | null;
};

const EMPTY_BILLING: OrgBillingStatus = {
  phase: 'unstarted',
  isReadOnly: false,
  daysRemainingUntilReadOnly: null,
  trialDaysRemaining: null,
};

function parseTs(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Días enteros hacia arriba; 0 si ya venció. */
export function daysRemaining(until: Date, now: Date): number {
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}

/**
 * Reloj que puede bloquear la org.
 * Si Ana tocó el pago (paying_status_changed_at), ese plazo pisa al trial:
 * un trial ya vencido no anula los 3 días del botón "Iniciar plazo".
 */
export function writableUntil(fields: OrgBillingFields, now: Date = new Date()): Date | null {
  if (fields.is_paying_customer) return null;
  const payingChangedAt = parseTs(fields.paying_status_changed_at);
  if (payingChangedAt) return addDays(payingChangedAt, GRACE_DAYS);
  const trialEndsAt = parseTs(fields.trial_ends_at);
  if (trialEndsAt) return addDays(trialEndsAt, GRACE_DAYS);
  return null;
}

export function isOrgReadOnly(fields: OrgBillingFields, now: Date = new Date()): boolean {
  if (fields.is_paying_customer) return false;
  const until = writableUntil(fields, now);
  if (!until) return false;
  return now.getTime() >= until.getTime();
}

export function deriveOrgBilling(
  fields: OrgBillingFields | null | undefined,
  now: Date = new Date()
): OrgBillingStatus {
  if (!fields) return { ...EMPTY_BILLING };

  if (fields.is_paying_customer) {
    return {
      phase: 'paying',
      isReadOnly: false,
      daysRemainingUntilReadOnly: null,
      trialDaysRemaining: null,
    };
  }

  const trialEndsAt = parseTs(fields.trial_ends_at);
  const payingChangedAt = parseTs(fields.paying_status_changed_at);
  const until = writableUntil(fields, now);
  const readOnly = isOrgReadOnly(fields, now);
  const trialDaysRemaining =
    trialEndsAt && now.getTime() < trialEndsAt.getTime() ? daysRemaining(trialEndsAt, now) : null;

  if (!payingChangedAt && !trialEndsAt) {
    return {
      phase: 'unstarted',
      isReadOnly: false,
      daysRemainingUntilReadOnly: null,
      trialDaysRemaining: null,
    };
  }

  if (readOnly) {
    return {
      phase: 'readonly',
      isReadOnly: true,
      daysRemainingUntilReadOnly: 0,
      trialDaysRemaining: null,
    };
  }

  const daysUntilLock = until ? daysRemaining(until, now) : null;

  if (payingChangedAt) {
    return {
      phase: 'grace',
      isReadOnly: false,
      daysRemainingUntilReadOnly: daysUntilLock,
      trialDaysRemaining,
    };
  }

  if (trialEndsAt && now.getTime() < trialEndsAt.getTime()) {
    return {
      phase: 'trial',
      isReadOnly: false,
      daysRemainingUntilReadOnly: daysUntilLock,
      trialDaysRemaining,
    };
  }

  return {
    phase: 'grace',
    isReadOnly: false,
    daysRemainingUntilReadOnly: daysUntilLock,
    trialDaysRemaining: null,
  };
}

export function emptyOrgBilling(): OrgBillingStatus {
  return { ...EMPTY_BILLING };
}

function pluralDias(n: number): string {
  return n === 1 ? 'día' : 'días';
}

/** Texto del banner global. null = no mostrar. */
export function subscriptionBannerCopy(status: OrgBillingStatus): string | null {
  switch (status.phase) {
    case 'trial': {
      const n = status.trialDaysRemaining ?? status.daysRemainingUntilReadOnly ?? 0;
      return `Te quedan ${n} ${pluralDias(n)} de prueba. Activa tu suscripción para seguir usando todas las funciones.`;
    }
    case 'grace': {
      const n = status.daysRemainingUntilReadOnly ?? 0;
      return `En ${n} ${pluralDias(n)} la cuenta pasa a solo lectura. Activa tu suscripción para seguir cargando datos.`;
    }
    case 'readonly':
      return 'Solo lectura. Suscribite para volver a cargar datos.';
    default:
      return null;
  }
}
