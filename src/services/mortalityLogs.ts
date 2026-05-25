import { supabase } from './supabase';
import { MortalityLog } from '../types';
import { syncGallineroCurrentCount } from './gallineroFlocks';

export const mortalityLogsService = {
  async getByGallinero(
    organizationId: string,
    gallineroId: string,
    limit = 5
  ): Promise<MortalityLog[]> {
    const { data, error } = await supabase
      .from('gallinero_mortality_logs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async create(
    organizationId: string,
    gallineroId: string,
    date: string,
    count: number,
    cause?: string,
    notes?: string,
    flockId?: string | null
  ): Promise<{ log: MortalityLog; newFlockCount: number; newGallineroCount: number }> {
    const qty = Math.max(1, Math.floor(Number(count) || 0));

    if (!flockId) {
      throw new Error('Debe indicarse la camada (flock_id) para registrar la baja.');
    }

    let newFlockCount = 0;

    if (flockId) {
      const { data: flock, error: flockErr } = await supabase
        .from('gallinero_flocks')
        .select('id, gallinero_id, current_count, status')
        .eq('organization_id', organizationId)
        .eq('id', flockId)
        .eq('gallinero_id', gallineroId)
        .single();

      if (flockErr) throw flockErr;
      if (flock.status !== 'active') {
        throw new Error('La camada seleccionada no está activa.');
      }

      const flockCurrent = Math.max(0, Math.floor(Number(flock.current_count) || 0));
      newFlockCount = Math.max(0, flockCurrent - qty);

      const { error: flockUpdateErr } = await supabase
        .from('gallinero_flocks')
        .update({ current_count: newFlockCount, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('id', flockId);

      if (flockUpdateErr) throw flockUpdateErr;
    }

    const { data: log, error: insertErr } = await supabase
      .from('gallinero_mortality_logs')
      .insert({
        organization_id: organizationId,
        gallinero_id: gallineroId,
        flock_id: flockId || null,
        date: String(date).slice(0, 10),
        count: qty,
        cause: cause?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    const newGallineroCount = await syncGallineroCurrentCount(organizationId, gallineroId);

    return {
      log: log as MortalityLog,
      newFlockCount,
      newGallineroCount,
    };
  },
};
