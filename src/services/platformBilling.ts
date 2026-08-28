import { supabase } from './supabase';

export type PlatformOrganizationRow = {
  id: string;
  name: string;
  is_paying_customer: boolean;
  created_at: string;
  signup_owner_email: string | null;
};

export const platformBillingService = {
  async getPayingStatus(organizationId: string): Promise<boolean | null> {
    const { data, error } = await supabase
      .from('organizations')
      .select('is_paying_customer')
      .eq('id', organizationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data.is_paying_customer === true;
  },

  async listAllOrganizations(): Promise<PlatformOrganizationRow[]> {
    const { data, error } = await supabase.rpc('platform_admin_list_organizations');
    if (error) throw error;
    return (data ?? []) as PlatformOrganizationRow[];
  },

  async setPayingCustomer(orgId: string, paying: boolean): Promise<void> {
    const { error } = await supabase.rpc('platform_admin_set_paying_customer', {
      p_org_id: orgId,
      p_paying: paying,
    });
    if (error) throw error;
  },
};
