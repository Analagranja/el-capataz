import { supabase } from './supabase';
import { Gallinero, GallineroFlock } from '../types';

console.log('Conectado a Supabase');

type GallineroRow = Gallinero & { gallinero_flocks?: GallineroFlock[] | null };

function mapGallineroRow(row: GallineroRow): Gallinero {
  const flocks = row.gallinero_flocks ?? [];
  const active = flocks.filter((f) => f.status === 'active');
  const current_count = active.reduce(
    (sum, f) => sum + Math.max(0, Math.floor(Number(f.current_count) || 0)),
    0
  );
  const { gallinero_flocks: _gf, ...base } = row;
  return {
    ...base,
    flocks,
    current_count,
    capacity: Number((base as Gallinero).capacity) || 0,
  };
}

const GALLINERO_SELECT = '*, gallinero_flocks(*)';

export const gallinerosService = {
  async getAll(organizationId: string): Promise<Gallinero[]> {
    const { data, error } = await supabase
      .from('gallineros')
      .select(GALLINERO_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => mapGallineroRow(row as GallineroRow));
  },

  async getById(organizationId: string, id: string): Promise<Gallinero | null> {
    const { data, error } = await supabase
      .from('gallineros')
      .select(GALLINERO_SELECT)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? mapGallineroRow(data as GallineroRow) : null;
  },

  async create(organizationId: string, name: string, color: string): Promise<Gallinero> {
    const { data, error } = await supabase
      .from('gallineros')
      .insert({
        organization_id: organizationId,
        name,
        color,
        current_count: 0,
      })
      .select(GALLINERO_SELECT)
      .single();

    if (error) throw error;
    return mapGallineroRow(data as GallineroRow);
  },

  async update(
    organizationId: string,
    id: string,
    updates: Partial<Pick<Gallinero, 'name' | 'color' | 'capacity'>>
  ): Promise<Gallinero> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.color !== undefined) payload.color = updates.color;
    if (updates.capacity !== undefined) payload.capacity = updates.capacity;

    const { data, error } = await supabase
      .from('gallineros')
      .update(payload)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select(GALLINERO_SELECT)
      .single();

    if (error) throw error;
    return mapGallineroRow(data as GallineroRow);
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
