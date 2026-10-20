import { supabase } from './supabase';
import { isOrgReadOnly, type OrgBillingFields } from '../utils/orgBilling';

export const ORG_READ_ONLY = 'ORG_READ_ONLY';

export class OrgReadOnlyError extends Error {
  readonly code = ORG_READ_ONLY;
  constructor(message = 'Esta granja está en modo solo lectura.') {
    super(message);
    this.name = 'OrgReadOnlyError';
  }
}

export function isOrgReadOnlyError(error: unknown): error is OrgReadOnlyError {
  return (
    error instanceof OrgReadOnlyError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === ORG_READ_ONLY)
  );
}

/**
 * Parte 1: helper listo. Parte 2 lo llama al inicio de cada create/update/delete.
 * No está cableado a los servicios todavía.
 */
export async function ensureWritable(organizationId: string): Promise<void> {
  const { data, error } = await supabase
    .from('organizations')
    .select('is_paying_customer, paying_status_changed_at, trial_ends_at')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('organization_not_found');

  const fields = data as OrgBillingFields;
  if (isOrgReadOnly(fields)) {
    throw new OrgReadOnlyError();
  }
}
