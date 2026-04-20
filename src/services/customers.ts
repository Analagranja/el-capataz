import { supabase } from './supabase';
import { Customer } from '../types';

export const customersService = {
  async getAll(organizationId: string): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async create(
    organizationId: string,
    name: string,
    phone?: string,
    address?: string,
    notes?: string
  ): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        name,
        phone: phone || null,
        address: address || null,
        notes: notes?.trim() ? notes.trim() : null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(
    organizationId: string,
    id: string,
    fields: { name: string; phone?: string; address?: string; notes?: string }
  ): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .update({
        name: fields.name,
        phone: fields.phone?.trim() ? fields.phone.trim() : null,
        address: fields.address?.trim() ? fields.address.trim() : null,
        notes: fields.notes?.trim() ? fields.notes.trim() : null,
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
