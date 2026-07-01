import { supabase } from './supabase';
import { FeedConsumptionMonthly } from '../types';

const SELECT_COLUMNS =
  'id, organization_id, gallinero_id, year, month, kg_consumed, notes, created_at, updated_at';

type FeedConsumptionMonthlyRow = {
  id: string;
  organization_id: string;
  gallinero_id: string | null;
  year: number;
  month: number;
  kg_consumed: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toFeedConsumptionMonthly(row: FeedConsumptionMonthlyRow): FeedConsumptionMonthly {
  return {
    id: row.id,
    organization_id: row.organization_id,
    gallinero_id: row.gallinero_id ?? null,
    year: Number(row.year),
    month: Number(row.month),
    kg_consumed: Number(row.kg_consumed ?? 0),
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeGallineroId(gallineroId?: string | null): string | null {
  const id = String(gallineroId ?? '').trim();
  return id.length > 0 ? id : null;
}

export const feedConsumptionMonthlyService = {
  async getByPeriod(
    organizationId: string,
    year: number,
    month: number,
    gallineroId?: string | null
  ): Promise<FeedConsumptionMonthly | null> {
    const gId = normalizeGallineroId(gallineroId);
    let query = supabase
      .from('feed_consumption_monthly')
      .select(SELECT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('year', year)
      .eq('month', month);

    if (gId === null) {
      query = query.is('gallinero_id', null);
    } else {
      query = query.eq('gallinero_id', gId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toFeedConsumptionMonthly(data as FeedConsumptionMonthlyRow);
  },

  async upsert(
    organizationId: string,
    year: number,
    month: number,
    kgConsumed: number,
    notes?: string | null,
    gallineroId?: string | null
  ): Promise<FeedConsumptionMonthly> {
    const gId = normalizeGallineroId(gallineroId);
    const payload = {
      organization_id: organizationId,
      gallinero_id: gId,
      year,
      month,
      kg_consumed: kgConsumed,
      notes: notes?.trim() ? notes.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('feed_consumption_monthly')
      .upsert(payload, { onConflict: 'organization_id,gallinero_id,year,month' })
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw error;
    return toFeedConsumptionMonthly(data as FeedConsumptionMonthlyRow);
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('feed_consumption_monthly')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },
};
