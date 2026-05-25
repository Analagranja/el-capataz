import { supabase } from './supabase';
import { GallineroFlock } from '../types';

function trimOrNull(value: string | null | undefined): string | null {
  const t = String(value ?? '').trim();
  return t.length > 0 ? t : null;
}

export type GallineroFlockInput = {
  name: string;
  current_count: number;
  birth_date?: string | null;
  breed?: string | null;
  feather_color?: string | null;
  average_weight_kg?: number | null;
  band_number?: string | null;
  band_color?: string | null;
  supplier?: string | null;
  notes_flock?: string | null;
};

function flockFieldsForDb(data: GallineroFlockInput): Record<string, string | number | null> {
  const weight = data.average_weight_kg;
  return {
    name: data.name.trim() || 'Camada 1',
    current_count: Math.max(0, Math.floor(Number(data.current_count) || 0)),
    birth_date: data.birth_date ? String(data.birth_date).slice(0, 10) : null,
    breed: trimOrNull(data.breed),
    feather_color: trimOrNull(data.feather_color),
    band_number: trimOrNull(data.band_number),
    band_color: trimOrNull(data.band_color),
    supplier: trimOrNull(data.supplier),
    notes_flock: trimOrNull(data.notes_flock),
    average_weight_kg:
      weight === null || weight === undefined || !Number.isFinite(Number(weight))
        ? null
        : Number(weight),
  };
}

/** Recalcula `gallineros.current_count` como suma de camadas activas. */
export async function syncGallineroCurrentCount(
  organizationId: string,
  gallineroId: string
): Promise<number> {
  const { data: flocks, error: fetchErr } = await supabase
    .from('gallinero_flocks')
    .select('current_count')
    .eq('organization_id', organizationId)
    .eq('gallinero_id', gallineroId)
    .eq('status', 'active');

  if (fetchErr) throw fetchErr;

  const total = (flocks || []).reduce(
    (sum, f) => sum + Math.max(0, Math.floor(Number(f.current_count) || 0)),
    0
  );

  const { error: updateErr } = await supabase
    .from('gallineros')
    .update({ current_count: total, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', gallineroId);

  if (updateErr) throw updateErr;
  return total;
}

export const gallineroFlocksService = {
  async getByGallinero(organizationId: string, gallineroId: string): Promise<GallineroFlock[]> {
    const { data, error } = await supabase
      .from('gallinero_flocks')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async create(
    organizationId: string,
    gallineroId: string,
    data: GallineroFlockInput
  ): Promise<GallineroFlock> {
    const { data: row, error } = await supabase
      .from('gallinero_flocks')
      .insert({
        organization_id: organizationId,
        gallinero_id: gallineroId,
        status: 'active',
        ...flockFieldsForDb(data),
      })
      .select()
      .single();

    if (error) throw error;
    await syncGallineroCurrentCount(organizationId, gallineroId);
    return row as GallineroFlock;
  },

  async update(
    organizationId: string,
    flockId: string,
    data: Partial<GallineroFlockInput> & { name?: string; current_count?: number }
  ): Promise<GallineroFlock> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) payload.name = data.name.trim() || 'Camada 1';
    if (data.current_count !== undefined) {
      payload.current_count = Math.max(0, Math.floor(Number(data.current_count) || 0));
    }
    if (data.birth_date !== undefined) {
      payload.birth_date = data.birth_date ? String(data.birth_date).slice(0, 10) : null;
    }
    if (data.breed !== undefined) payload.breed = trimOrNull(data.breed);
    if (data.feather_color !== undefined) payload.feather_color = trimOrNull(data.feather_color);
    if (data.band_number !== undefined) payload.band_number = trimOrNull(data.band_number);
    if (data.band_color !== undefined) payload.band_color = trimOrNull(data.band_color);
    if (data.supplier !== undefined) payload.supplier = trimOrNull(data.supplier);
    if (data.notes_flock !== undefined) payload.notes_flock = trimOrNull(data.notes_flock);
    if (data.average_weight_kg !== undefined) {
      const w = data.average_weight_kg;
      payload.average_weight_kg =
        w === null || w === undefined || !Number.isFinite(Number(w)) ? null : Number(w);
    }

    const { data: row, error } = await supabase
      .from('gallinero_flocks')
      .update(payload)
      .eq('organization_id', organizationId)
      .eq('id', flockId)
      .select()
      .single();

    if (error) throw error;
    await syncGallineroCurrentCount(organizationId, row.gallinero_id);
    return row as GallineroFlock;
  },

  async retire(organizationId: string, flockId: string): Promise<void> {
    const { data: row, error } = await supabase
      .from('gallinero_flocks')
      .update({ status: 'retired', updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', flockId)
      .select('gallinero_id')
      .single();

    if (error) throw error;
    await syncGallineroCurrentCount(organizationId, row.gallinero_id);
  },

  async updateCount(organizationId: string, flockId: string, newCount: number): Promise<void> {
    const count = Math.max(0, Math.floor(Number(newCount) || 0));
    const { data: row, error } = await supabase
      .from('gallinero_flocks')
      .update({ current_count: count, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', flockId)
      .select('gallinero_id')
      .single();

    if (error) throw error;
    await syncGallineroCurrentCount(organizationId, row.gallinero_id);
  },

  syncGallineroCurrentCount,
};
