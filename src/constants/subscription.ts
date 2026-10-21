/** Links de suscripción Mercado Pago. */
export const SUBSCRIPTION_PLAN_LINKS = {
  /** Landing y prueba activa: plan con días de prueba. */
  basico: 'https://mpago.la/16fRYJT',
  /** Prueba ya vencida (gracia o solo lectura): pago el mismo día, sin prueba. */
  basicoPostTrial: 'https://mpago.la/1fbT5uP',
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
