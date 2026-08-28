/** Links de suscripción Mercado Pago (landing descarga.html). */
export const SUBSCRIPTION_PLAN_LINKS = {
  basico: 'https://mpago.la/16fRYJT',
  pro: 'https://mpago.la/1XwivfQ',
} as const;

/** Email con acceso al panel de suscripciones de plataforma (debe coincidir con is_platform_admin en BD). */
export const PLATFORM_ADMIN_EMAILS = ['adallasta@abc.gob.ar'] as const;

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  const normalized = String(email ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return PLATFORM_ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}
