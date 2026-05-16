import { supabase } from './supabase';
import { ProductionRecord } from '../types';
import { addOneLocalCalendarDayYmd } from '../utils/statsPeriod';

/** `production_records.date` es tipo `date` en Postgres: solo YYYY-MM-DD, sin hora. */
export function productionFormDateToDbDate(ymd: string): string {
  const s = String(ymd).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error('Fecha inválida');
  }
  const [y, m, d] = s.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error('Fecha inválida');
  }
  return s;
}

export function computeLayingPercentage(eggsCount: number, poultryCount: number): number {
  const n = Math.max(0, Math.floor(Number(poultryCount) || 0));
  return n > 0 ? (eggsCount / n) * 100 : 0;
}

function normalizeRecord(raw: ProductionRecord): ProductionRecord {
  const pou = Math.max(0, Math.floor(Number(raw.poultry_count) || 0));
  return {
    ...raw,
    poultry_count: pou,
    laying_percentage: computeLayingPercentage(raw.eggs_count, pou),
  };
}

export const productionService = {
  async getByGallineroAndDate(
    organizationId: string,
    gallineroId: string,
    date: string
  ): Promise<ProductionRecord | null> {
    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .eq('date', date)
      .maybeSingle();

    if (error) throw error;
    return data ? normalizeRecord(data as ProductionRecord) : null;
  },

  async getByGallinero(
    organizationId: string,
    gallineroId: string,
    daysBack = 30
  ): Promise<ProductionRecord[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .gte('date', fromDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw error;
    return (data || []).map((record) => normalizeRecord(record as ProductionRecord));
  },

  async getByGallineroRange(
    organizationId: string,
    gallineroId: string,
    fromDate: string,
    toDate: string
  ): Promise<ProductionRecord[]> {
    const toExclusive = addOneLocalCalendarDayYmd(toDate);
    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .gte('date', fromDate)
      .lt('date', toExclusive)
      .order('date', { ascending: false });

    if (error) throw error;
    return (data || []).map((record) => normalizeRecord(record as ProductionRecord));
  },

  async getAll(organizationId: string, daysBack = 30): Promise<ProductionRecord[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', fromDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw error;
    return (data || []).map((record) => normalizeRecord(record as ProductionRecord));
  },

  async getAllRange(
    organizationId: string,
    fromDate: string,
    toDate: string
  ): Promise<ProductionRecord[]> {
    const toExclusive = addOneLocalCalendarDayYmd(toDate);
    const { data, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', fromDate)
      .lt('date', toExclusive)
      .order('date', { ascending: false });

    if (error) throw error;
    return (data || []).map((record) => normalizeRecord(record as ProductionRecord));
  },

  async create(
    organizationId: string,
    gallineroId: string,
    date: string,
    eggsCount: number,
    brokenDirtyEggsCount: number,
    poultryCount: number,
    notes?: string
  ): Promise<ProductionRecord> {
    const layingPercentage = computeLayingPercentage(eggsCount, poultryCount);
    const dateDb = productionFormDateToDbDate(date);

    const { data, error } = await supabase
      .from('production_records')
      .insert({
        organization_id: organizationId,
        gallinero_id: gallineroId,
        date: dateDb,
        eggs_count: eggsCount,
        broken_dirty_eggs_count: brokenDirtyEggsCount,
        poultry_count: Math.max(0, Math.floor(poultryCount)),
        laying_percentage: layingPercentage,
        notes,
      })
      .select()
      .single();

    if (error) throw error;
    return normalizeRecord(data as ProductionRecord);
  },

  /**
   * `poultryCount` es el valor histórico del registro (no se modifica en BD al editar huevos/notas).
   */
  async update(
    organizationId: string,
    id: string,
    date: string,
    eggsCount: number,
    brokenDirtyEggsCount: number,
    poultryCount: number,
    notes?: string
  ): Promise<ProductionRecord> {
    const layingPercentage = computeLayingPercentage(eggsCount, poultryCount);
    const dateDb = productionFormDateToDbDate(date);

    const data = {
      date: dateDb,
      eggs_count: eggsCount,
      broken_dirty_eggs_count: brokenDirtyEggsCount,
      laying_percentage: layingPercentage,
      notes: notes ?? null,
    };
    console.log('Datos enviados a Supabase:', data);
    console.log('production_records.update eq id:', id);

    const { data: row, error } = await supabase
      .from('production_records')
      .update(data)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return normalizeRecord(row as ProductionRecord);
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('production_records')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },
};
