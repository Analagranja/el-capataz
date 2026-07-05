import { supabase } from './supabase';
import { FeedConsumptionMonthly } from '../types';

const SELECT_COLUMNS =
  'id, organization_id, gallinero_id, year, month, kg_consumed, notes, hens_snapshot, created_at, updated_at';

type FeedConsumptionMonthlyRow = {
  id: string;
  organization_id: string;
  gallinero_id: string | null;
  year: number;
  month: number;
  kg_consumed: number;
  notes: string | null;
  hens_snapshot?: number | null;
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
    hens_snapshot:
      row.hens_snapshot != null && Number.isFinite(Number(row.hens_snapshot))
        ? Number(row.hens_snapshot)
        : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeGallineroId(gallineroId?: string | null): string | null {
  const id = String(gallineroId ?? '').trim();
  return id.length > 0 ? id : null;
}

function normalizeHensSnapshot(hensSnapshot?: number | null): number | null {
  if (hensSnapshot == null || !Number.isFinite(Number(hensSnapshot))) return null;
  const n = Math.floor(Number(hensSnapshot));
  return n > 0 ? n : null;
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

  async getAllByYear(
    organizationId: string,
    year: number,
    gallineroId?: string | null
  ): Promise<FeedConsumptionMonthly[]> {
    const gId = normalizeGallineroId(gallineroId);
    let query = supabase
      .from('feed_consumption_monthly')
      .select(SELECT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('year', year)
      .order('month');

    if (gId === null) {
      query = query.is('gallinero_id', null);
    } else {
      query = query.eq('gallinero_id', gId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => toFeedConsumptionMonthly(row as FeedConsumptionMonthlyRow));
  },

  async upsert(
    organizationId: string,
    year: number,
    month: number,
    kgConsumed: number,
    notes?: string | null,
    gallineroId?: string | null,
    hensSnapshot?: number | null
  ): Promise<FeedConsumptionMonthly> {
    const gId = normalizeGallineroId(gallineroId);
    const notesValue = notes ?? null;
    const hensValue = normalizeHensSnapshot(hensSnapshot);

    let existingQuery = supabase
      .from('feed_consumption_monthly')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('year', year)
      .eq('month', month);

    if (gId === null) {
      existingQuery = existingQuery.is('gallinero_id', null);
    } else {
      existingQuery = existingQuery.eq('gallinero_id', gId);
    }

    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const { data, error } = await supabase
        .from('feed_consumption_monthly')
        .update({
          kg_consumed: kgConsumed,
          notes: notesValue,
          hens_snapshot: hensValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return toFeedConsumptionMonthly(data as FeedConsumptionMonthlyRow);
    }

    const { data, error } = await supabase
      .from('feed_consumption_monthly')
      .insert({
        organization_id: organizationId,
        gallinero_id: gId,
        year,
        month,
        kg_consumed: kgConsumed,
        notes: notesValue,
        hens_snapshot: hensValue,
      })
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
