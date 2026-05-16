import { supabase } from './supabase';
import { FeedLog, FeedLogTipo } from '../types';

type FeedLogRow = {
  id: string;
  organization_id: string;
  gallinero_id: string;
  log_date: string;
  kg_opened: number;
  tipo?: string | null;
  cantidad_bolsas?: number | null;
  kg_por_bolsa?: number | null;
  created_at: string;
};

function toFeedLog(row: FeedLogRow): FeedLog {
  const tipoRaw = String(row.tipo ?? 'bolsas').toLowerCase();
  const tipo: FeedLogTipo = tipoRaw === 'granel' ? 'granel' : 'bolsas';
  return {
    id: row.id,
    organization_id: row.organization_id,
    gallinero_id: row.gallinero_id,
    date: row.log_date,
    kg_opened: Number(row.kg_opened || 0),
    tipo,
    cantidad_bolsas:
      row.cantidad_bolsas != null && Number.isFinite(Number(row.cantidad_bolsas))
        ? Number(row.cantidad_bolsas)
        : null,
    kg_por_bolsa:
      row.kg_por_bolsa != null && Number.isFinite(Number(row.kg_por_bolsa))
        ? Number(row.kg_por_bolsa)
        : null,
    created_at: row.created_at,
  };
}

const FEED_LOG_SELECT =
  'id, organization_id, gallinero_id, log_date, kg_opened, tipo, cantidad_bolsas, kg_por_bolsa, created_at';

export const feedLogsService = {
  async getAll(organizationId: string, daysBack = 365): Promise<FeedLog[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('feed_logs')
      .select(FEED_LOG_SELECT)
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
      .select(FEED_LOG_SELECT)
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
      .select(FEED_LOG_SELECT)
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
      .select(FEED_LOG_SELECT)
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
    kgOpened: number,
    meta?: {
      tipo: FeedLogTipo;
      cantidad_bolsas?: number | null;
      kg_por_bolsa?: number | null;
    }
  ): Promise<FeedLog> {
    const tipo = meta?.tipo ?? 'bolsas';
    const payload: Record<string, unknown> = {
      organization_id: organizationId,
      gallinero_id: gallineroId,
      log_date: date,
      kg_opened: kgOpened,
      tipo,
    };
    if (tipo === 'bolsas') {
      payload.cantidad_bolsas =
        meta?.cantidad_bolsas != null ? Math.round(Number(meta.cantidad_bolsas)) : null;
      payload.kg_por_bolsa = meta?.kg_por_bolsa != null ? Number(meta.kg_por_bolsa) : null;
    } else {
      payload.cantidad_bolsas = null;
      payload.kg_por_bolsa = null;
    }

    const { data, error } = await supabase.from('feed_logs').insert(payload).select(FEED_LOG_SELECT).single();

    if (error) throw error;
    return toFeedLog(data as FeedLogRow);
  },
};
