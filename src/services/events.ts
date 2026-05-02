import { supabase } from './supabase';
import { Event, EventType } from '../types';
import { gallinerosService } from './gallineros';

/** Tipos de evento que pueden tener recordatorio de próxima aplicación */
export const SANIDAD_EVENT_TYPES: EventType[] = ['vacunacion', 'vitaminas', 'medicacion'];

export function isSanidadEventType(t: EventType): boolean {
  return SANIDAD_EVENT_TYPES.includes(t);
}

/**
 * Convierte YYYY-MM-DD del input de calendario a timestamptz estable (mediodía UTC)
 * para evitar corrimientos de día por zona horaria al guardar/leer.
 */
export function eventCalendarDateToDbIso(ymd: string): string {
  const s = String(ymd).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error('Fecha inválida');
  }
  const [y, m, d] = s.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error('Fecha inválida');
  }
  return `${s}T12:00:00.000Z`;
}

/** Límite inferior inclusive para listar eventos (solo fecha, coherente con timestamptz en BD). */
function eventsListLowerBoundYmd(daysBack: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - Math.max(0, Math.floor(daysBack)));
  return d.toISOString().slice(0, 10);
}

/** Valor seguro para columna `date` en Postgres (evita '' que rompe el INSERT). */
function normalizeReminderDateForDb(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const day = s.length >= 10 ? s.slice(0, 10) : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Compatibilidad con filas previas a la migración de tipos */
function coerceEventType(raw: string): EventType {
  if (raw === 'vacuna') return 'vacunacion';
  if (raw === 'observacion') return 'otros';
  return raw as EventType;
}

/** Tipos que modifican el stock de gallinas en el gallinero */
function isStockDecrease(type: EventType): boolean {
  return type === 'muerte';
}

function isStockIncrease(type: EventType): boolean {
  return type === 'ingreso_pollitas';
}

async function adjustGallineroStock(
  organizationId: string,
  gallineroId: string,
  eventType: EventType,
  affectedCount: number,
  mode: 'apply' | 'revert'
): Promise<void> {
  const n = Math.max(0, Math.floor(Number(affectedCount) || 0));
  if (n === 0) return;
  if (!isStockDecrease(eventType) && !isStockIncrease(eventType)) return;

  const gallinero = await gallinerosService.getById(organizationId, gallineroId);
  if (!gallinero) return;

  let next = gallinero.current_count;

  if (eventType === 'muerte') {
    if (mode === 'apply') {
      next = Math.max(0, gallinero.current_count - n);
    } else {
      next = Math.min(gallinero.capacity, gallinero.current_count + n);
    }
  } else if (eventType === 'ingreso_pollitas') {
    if (mode === 'apply') {
      next = Math.min(gallinero.capacity, gallinero.current_count + n);
    } else {
      next = Math.max(0, gallinero.current_count - n);
    }
  }

  if (next !== gallinero.current_count) {
    await gallinerosService.update(organizationId, gallineroId, { current_count: next });
  }
}

export const eventsService = {
  async getById(organizationId: string, id: string): Promise<Event | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getByGallinero(
    organizationId: string,
    gallineroId: string,
    daysBack = 30
  ): Promise<Event[]> {
    const fromYmd = eventsListLowerBoundYmd(daysBack);

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .gte('date', fromYmd)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getAll(organizationId: string, daysBack = 30): Promise<Event[]> {
    const fromYmd = eventsListLowerBoundYmd(daysBack);

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', fromYmd)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getAllRange(organizationId: string, fromDate: string, toDate: string): Promise<Event[]> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getByGallineroRange(
    organizationId: string,
    gallineroId: string,
    fromDate: string,
    toDate: string
  ): Promise<Event[]> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('gallinero_id', gallineroId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Próximo recordatorio de sanidad pendiente (menor reminder_date entre no completados).
   */
  async getNextSanidadReminder(organizationId: string): Promise<Event | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .in('event_type', SANIDAD_EVENT_TYPES)
      .eq('completed', false)
      .not('reminder_date', 'is', null)
      .order('reminder_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async markReminderCompleted(organizationId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('events')
      .update({ completed: true })
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },

  async create(
    organizationId: string,
    gallineroId: string,
    eventType: EventType,
    description: string,
    affectedCount: number,
    date: string,
    reminderDate?: string | null
  ): Promise<Event> {
    const reminderNormalized = isSanidadEventType(eventType)
      ? normalizeReminderDateForDb(reminderDate)
      : null;

    const { data, error } = await supabase
      .from('events')
      .insert({
        organization_id: organizationId,
        gallinero_id: gallineroId,
        event_type: eventType,
        description,
        affected_count: affectedCount,
        date,
        reminder_date: reminderNormalized,
        completed: false,
      })
      .select()
      .single();

    if (error) throw error;

    await adjustGallineroStock(organizationId, gallineroId, eventType, affectedCount, 'apply');

    return data;
  },

  async update(
    organizationId: string,
    id: string,
    gallineroId: string,
    eventType: EventType,
    description: string,
    affectedCount: number,
    date: string,
    extras?: { reminder_date?: string | null; completed?: boolean }
  ): Promise<Event> {
    const previous = await this.getById(organizationId, id);
    if (!previous) throw new Error('Evento no encontrado');

    await adjustGallineroStock(
      organizationId,
      previous.gallinero_id,
      coerceEventType(previous.event_type),
      previous.affected_count,
      'revert'
    );

    const nextReminderRaw =
      extras?.reminder_date !== undefined
        ? extras.reminder_date
        : isSanidadEventType(eventType)
          ? (previous.reminder_date ?? null)
          : null;
    const nextReminder = isSanidadEventType(eventType)
      ? normalizeReminderDateForDb(nextReminderRaw as string | null | undefined)
      : null;
    const nextCompleted =
      extras?.completed !== undefined ? extras.completed : (previous.completed ?? false);

    const { data, error } = await supabase
      .from('events')
      .update({
        gallinero_id: gallineroId,
        event_type: eventType,
        description,
        affected_count: affectedCount,
        date,
        reminder_date: isSanidadEventType(eventType) ? nextReminder : null,
        completed: isSanidadEventType(eventType) ? nextCompleted : false,
      })
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await adjustGallineroStock(organizationId, gallineroId, eventType, affectedCount, 'apply');

    return data;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const existing = await this.getById(organizationId, id);
    if (existing) {
      await adjustGallineroStock(
        organizationId,
        existing.gallinero_id,
        coerceEventType(existing.event_type),
        existing.affected_count,
        'revert'
      );
    }

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error) throw error;
  },
};
