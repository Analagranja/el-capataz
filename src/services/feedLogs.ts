import { supabase } from './supabase';
import { FeedLog } from '../types';

type FeedLogRow = {
  id: string;
  organization_id: string;
  gallinero_id: string;
  log_date: string;
  kg_opened: number;
  created_at: string;
};

function toFeedLog(row: FeedLogRow): FeedLog {
  return {
    id: row.id,
    organization_id: row.organization_id,
    gallinero_id: row.gallinero_id,
    date: row.log_date,
    kg_opened: Number(row.kg_opened || 0),
    created_at: row.created_at,
  };
}

export const feedLogsService = {
  async getAll(organizationId: string, daysBack = 365): Promise<FeedLog[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('feed_logs')
      .select('id, organization_id, gallinero_id, log_date, kg_opened, created_at')
      .eq('organization_id', organizationId)
      .gte('log_date', fromDateStr)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => toFeedLog(row as FeedLogRow));
  },

  async getByGallinero(organizationId: string, gallineroId: string, daysBack = 365): Promise<FeedLog[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('feed_logs')
      .select('id, organization_id, gallinero_id, log_date, kg_opened, created_at')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .gte('log_date', fromDateStr)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => toFeedLog(row as FeedLogRow));
  },

  async getAllRange(organizationId: string, fromDate: string, toDate: string): Promise<FeedLog[]> {
    const { data, error } = await supabase
      .from('feed_logs')
      .select('id, organization_id, gallinero_id, log_date, kg_opened, created_at')
      .eq('organization_id', organizationId)
      .gte('log_date', fromDate)
      .lte('log_date', toDate)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => toFeedLog(row as FeedLogRow));
  },

  async getByGallineroRange(
    organizationId: string,
    gallineroId: string,
    fromDate: string,
    toDate: string
  ): Promise<FeedLog[]> {
    const { data, error } = await supabase
      .from('feed_logs')
      .select('id, organization_id, gallinero_id, log_date, kg_opened, created_at')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .gte('log_date', fromDate)
      .lte('log_date', toDate)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => toFeedLog(row as FeedLogRow));
  },

  async create(
    organizationId: string,
    gallineroId: string,
    date: string,
    kgOpened: number
  ): Promise<FeedLog> {
    const { data, error } = await supabase
      .from('feed_logs')
      .insert({
        organization_id: organizationId,
        gallinero_id: gallineroId,
        log_date: date,
        kg_opened: kgOpened,
      })
      .select('id, organization_id, gallinero_id, log_date, kg_opened, created_at')
      .single();

    if (error) throw error;
    return toFeedLog(data as FeedLogRow);
  },
};
