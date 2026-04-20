import { supabase } from './supabase';
import { Gallinero } from '../types';

console.log('Conectado a Supabase');

export const gallinerosService = {
  async getAll(organizationId: string): Promise<Gallinero[]> {
    const { data, error } = await supabase
      .from('gallineros')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getById(organizationId: string, id: string): Promise<Gallinero | null> {
    const { data, error } = await supabase
      .from('gallineros')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async create(
    organizationId: string,
    name: string,
    color: string,
    capacity: number
  ): Promise<Gallinero> {
    const { data, error } = await supabase
      .from('gallineros')
      .insert({
        organization_id: organizationId,
        name,
        color,
        capacity,
        current_count: capacity,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(
    organizationId: string,
    id: string,
    updates: Partial<Gallinero>
  ): Promise<Gallinero> {
    const { data, error } = await supabase
      .from('gallineros')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('gallineros')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },
};
