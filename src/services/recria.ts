import { supabase } from './supabase';
import type {
  RecriaEvent,
  RecriaEventType,
  RecriaFeedStage,
  RecriaFlock,
  RecriaWeeklyFollowup,
} from '../types';

export type RecriaFlockInput = {
  name: string;
  initial_count: number;
  breed?: string;
  supplier?: string;
  birth_date?: string;
  entry_date: string;
  location_notes?: string;
  notes?: string;
};

export type RecriaFollowupInput = {
  week_start_date: string;
  average_weight_g?: number | null;
  mortality_count: number;
  mortality_reason?: string;
  feed_stage: RecriaFeedStage;
  notes?: string;
};

export type RecriaEventInput = {
  event_type: RecriaEventType;
  description: string;
  affected_count?: number;
  event_date: string;
  reminder_date?: string;
};

function textOrNull(value: string | undefined): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

export const recriaService = {
  async getAll(organizationId: string): Promise<RecriaFlock[]> {
    const { data, error } = await supabase
      .from('recria_flocks')
      .select('*')
      .eq('organization_id', organizationId)
      .order('entry_date', { ascending: false });
    if (error) throw error;
    return (data || []) as RecriaFlock[];
  },

  async create(organizationId: string, userId: string | null, input: RecriaFlockInput): Promise<RecriaFlock> {
    const initialCount = Math.max(1, Math.floor(Number(input.initial_count) || 0));
    const { data, error } = await supabase
      .from('recria_flocks')
      .insert({
        organization_id: organizationId,
        name: input.name.trim(),
        initial_count: initialCount,
        current_count: initialCount,
        breed: textOrNull(input.breed),
        supplier: textOrNull(input.supplier),
        birth_date: textOrNull(input.birth_date),
        entry_date: input.entry_date,
        location_notes: textOrNull(input.location_notes),
        notes: textOrNull(input.notes),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return data as RecriaFlock;
  },

  async getFollowups(organizationId: string, flockId: string): Promise<RecriaWeeklyFollowup[]> {
    const { data, error } = await supabase
      .from('recria_weekly_followups')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('recria_flock_id', flockId)
      .order('week_start_date', { ascending: false });
    if (error) throw error;
    return (data || []) as RecriaWeeklyFollowup[];
  },

  async recordFollowup(
    organizationId: string,
    flockId: string,
    input: RecriaFollowupInput
  ): Promise<RecriaWeeklyFollowup> {
    const { data, error } = await supabase.rpc('record_recria_weekly_followup', {
      p_organization_id: organizationId,
      p_recria_flock_id: flockId,
      p_week_start_date: input.week_start_date,
      p_average_weight_g:
        input.average_weight_g == null || input.average_weight_g === 0
          ? null
          : Math.max(0, Math.floor(Number(input.average_weight_g))),
      p_mortality_count: Math.max(0, Math.floor(Number(input.mortality_count) || 0)),
      p_mortality_reason: textOrNull(input.mortality_reason),
      p_feed_stage: input.feed_stage,
      p_notes: textOrNull(input.notes),
    });
    if (error) throw error;
    return data as RecriaWeeklyFollowup;
  },

  async getEvents(organizationId: string, flockId: string): Promise<RecriaEvent[]> {
    const { data, error } = await supabase
      .from('recria_events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('recria_flock_id', flockId)
      .order('event_date', { ascending: false });
    if (error) throw error;
    return (data || []) as RecriaEvent[];
  },

  async createEvent(
    organizationId: string,
    userId: string | null,
    flockId: string,
    input: RecriaEventInput
  ): Promise<RecriaEvent> {
    const { data, error } = await supabase
      .from('recria_events')
      .insert({
        organization_id: organizationId,
        recria_flock_id: flockId,
        event_type: input.event_type,
        description: input.description.trim(),
        affected_count: Math.max(0, Math.floor(Number(input.affected_count) || 0)),
        event_date: input.event_date,
        reminder_date: textOrNull(input.reminder_date),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return data as RecriaEvent;
  },

  async graduate(
    organizationId: string,
    flockId: string,
    gallineroId: string,
    flockName?: string
  ): Promise<string> {
    const { data, error } = await supabase.rpc('graduate_recria_flock', {
      p_organization_id: organizationId,
      p_recria_flock_id: flockId,
      p_gallinero_id: gallineroId,
      p_flock_name: textOrNull(flockName),
    });
    if (error) throw error;
    return data as string;
  },
};
