import React from 'react';
import { Bird, ClipboardPlus, HeartPulse, Plus, Sprout } from 'lucide-react';
import { Gallinero, RecriaEvent, RecriaFeedStage, RecriaFlock, RecriaWeeklyFollowup } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';
import { gallinerosService } from '../services/gallineros';
import { recriaService } from '../services/recria';
import { formatUnknownError } from '../services/inventoryStockCalc';
import { todayLocalYmd } from '../utils/monthToDateFinance';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';

const FEED_STAGE_OPTIONS: Array<{ value: RecriaFeedStage; label: string }> = [
  { value: 'pre_iniciador', label: 'Pre-iniciador' },
  { value: 'iniciador', label: 'Iniciador' },
  { value: 'crecimiento', label: 'Crecimiento' },
  { value: 'desarrollo', label: 'Desarrollo' },
  { value: 'pre_postura', label: 'Pre-postura' },
];

const HEALTH_EVENT_OPTIONS = [
  { value: 'vacunacion', label: 'Vacunación' },
  { value: 'vitaminas', label: 'Vitaminas' },
  { value: 'medicacion', label: 'Medicación' },
  { value: 'otros', label: 'Otros' },
] as const;

type DetailTab = 'seguimiento' | 'sanidad' | 'graduar';
type FlockListFilter = 'active' | 'graduated' | 'all';

interface RecriaProps {
  onOpenGallinero?: (gallineroId: string) => void;
}

const LIST_FILTER_OPTIONS: Array<{ value: FlockListFilter; label: string }> = [
  { value: 'active', label: 'Activas' },
  { value: 'graduated', label: 'Graduadas' },
  { value: 'all', label: 'Todas' },
];

function emptyFlockForm() {
  return {
    name: '',
    breed: '',
    initial_count: '',
    supplier: '',
    birth_date: '',
    entry_date: todayLocalYmd(),
    location_notes: '',
    notes: '',
  };
}

function startOfWeekYmd(date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - mondayOffset);
  return local.toISOString().slice(0, 10);
}

function emptyFollowupForm() {
  return {
    week_start_date: startOfWeekYmd(),
    average_weight_g: '',
    mortality_count: '0',
    mortality_reason: '',
    feed_stage: 'pre_iniciador' as RecriaFeedStage,
    notes: '',
  };
}

function emptyEventForm() {
  return {
    event_type: 'vacunacion' as RecriaEvent['event_type'],
    description: '',
    affected_count: '0',
    event_date: todayLocalYmd(),
    reminder_date: '',
  };
}

function formatDate(ymd: string): string {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('es-AR');
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function formatWeightG(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value))} g`;
}

function ageForDate(flock: RecriaFlock, date = todayLocalYmd()): { weeks: number; approximate: boolean } {
  const start = flock.birth_date || flock.entry_date;
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${date}T00:00:00`);
  const days = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
  return { weeks: Math.floor(days / 7), approximate: !flock.birth_date };
}

function stageLabel(stage: RecriaFeedStage): string {
  return FEED_STAGE_OPTIONS.find((item) => item.value === stage)?.label ?? stage;
}

function eventLabel(type: RecriaEvent['event_type']): string {
  return HEALTH_EVENT_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

/** Días hasta reminder_date (YYYY-MM-DD); ≤0 = hoy o vencido. */
function calendarDaysUntilReminder(reminderDate: string): number {
  const raw = reminderDate.slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return Number.POSITIVE_INFINITY;
  const today = todayLocalYmd();
  const [ty, tm, td] = today.split('-').map(Number);
  const reminderMs = new Date(y, m - 1, d).getTime();
  const todayMs = new Date(ty, tm - 1, td).getTime();
  return Math.round((reminderMs - todayMs) / 86_400_000);
}

/** Próximo recordatorio pendiente (menor fecha, no completado). */
function nextPendingReminder(events: RecriaEvent[]): RecriaEvent | null {
  const pending = events
    .filter((e) => Boolean(e.reminder_date) && !e.completed)
    .sort((a, b) => String(a.reminder_date).localeCompare(String(b.reminder_date)));
  return pending[0] ?? null;
}

function reminderBannerText(event: RecriaEvent): { text: string; overdue: boolean } {
  const reminder = String(event.reminder_date || '').slice(0, 10);
  const days = calendarDaysUntilReminder(reminder);
  const label = eventLabel(event.event_type);
  if (days < 0) {
    const ago = Math.abs(days);
    return {
      text: `Recordatorio vencido: ${label}, hace ${ago} día${ago === 1 ? '' : 's'} (${formatDate(reminder)})`,
      overdue: true,
    };
  }
  if (days === 0) {
    return { text: `Recordatorio hoy: ${label} (${formatDate(reminder)})`, overdue: true };
  }
  return {
    text: `Próximo recordatorio: ${label}, ${formatDate(reminder)}`,
    overdue: false,
  };
}

export default function Recria({ onOpenGallinero }: RecriaProps) {
  const { organizationId, user } = useAuth();
  const { canManageCoops } = useRole();
  const [flocks, setFlocks] = React.useState<RecriaFlock[]>([]);
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState<RecriaFlock | null>(null);
  const [detailTab, setDetailTab] = React.useState<DetailTab>('seguimiento');
  const [followups, setFollowups] = React.useState<RecriaWeeklyFollowup[]>([]);
  const [healthEvents, setHealthEvents] = React.useState<RecriaEvent[]>([]);
  const [newFlockOpen, setNewFlockOpen] = React.useState(false);
  const [followupOpen, setFollowupOpen] = React.useState(false);
  const [eventOpen, setEventOpen] = React.useState(false);
  const [graduateOpen, setGraduateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [sanidadSuccess, setSanidadSuccess] = React.useState('');
  const [sanidadError, setSanidadError] = React.useState('');
  const [flockForm, setFlockForm] = React.useState(emptyFlockForm);
  const [followupForm, setFollowupForm] = React.useState(emptyFollowupForm);
  const [eventForm, setEventForm] = React.useState(emptyEventForm);
  const [graduateGallineroId, setGraduateGallineroId] = React.useState('');
  const [listFilter, setListFilter] = React.useState<FlockListFilter>('active');

  const load = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError('');
    try {
      const [flockRows, coopRows] = await Promise.all([
        recriaService.getAll(organizationId),
        gallinerosService.getAll(organizationId),
      ]);
      setFlocks(flockRows);
      setGallineros(coopRows);
      setSelected((current) => flockRows.find((flock) => flock.id === current?.id) ?? null);
    } catch (loadError) {
      console.error('Error loading recría:', loadError);
      setError(
        'No se pudo cargar Recría. Verificá que la migración del módulo esté aplicada en Supabase.'
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = React.useCallback(
    async (
      flock: RecriaFlock,
      options?: { preserveTab?: boolean; tab?: DetailTab }
    ) => {
      if (!organizationId) return;
      setSelected(flock);
      if (options?.tab) {
        setDetailTab(options.tab);
      } else if (!options?.preserveTab) {
        setDetailTab('seguimiento');
      }
      try {
        const [followupRows, eventRows] = await Promise.all([
          recriaService.getFollowups(organizationId, flock.id),
          recriaService.getEvents(organizationId, flock.id),
        ]);
        setFollowups(followupRows);
        setHealthEvents(eventRows);
      } catch (detailError) {
        console.error('Error loading flock detail:', detailError);
        setError('No se pudo cargar el detalle de la camada.');
      }
    },
    [organizationId]
  );

  const filteredFlocks = React.useMemo(() => {
    if (listFilter === 'active') return flocks.filter((flock) => flock.status === 'active');
    if (listFilter === 'graduated') return flocks.filter((flock) => flock.status === 'graduated');
    return flocks;
  }, [flocks, listFilter]);
  const gallineroById = React.useMemo(() => {
    const map = new Map<string, Gallinero>();
    gallineros.forEach((g) => map.set(g.id, g));
    return map;
  }, [gallineros]);
  const selectedAge = selected ? ageForDate(selected) : null;
  const isClosedFlock = selected != null && selected.status !== 'active';
  const lastFollowup = followups[0];
  const pendingReminder = nextPendingReminder(healthEvents);
  const reminderBanner = pendingReminder ? reminderBannerText(pendingReminder) : null;

  const submitFlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId) return;
    const initialCount = Math.floor(Number(flockForm.initial_count));
    if (!flockForm.name.trim() || !Number.isFinite(initialCount) || initialCount < 1 || !flockForm.entry_date) {
      setFormError('Completá nombre, cantidad inicial y fecha de ingreso.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const created = await recriaService.create(organizationId, user?.id ?? null, {
        ...flockForm,
        initial_count: initialCount,
      });
      setNewFlockOpen(false);
      setFlockForm(emptyFlockForm());
      await load();
      await loadDetail(created);
    } catch (saveError) {
      console.error('Error creating recría flock:', saveError);
      setFormError('No se pudo guardar la camada.');
    } finally {
      setSaving(false);
    }
  };

  const submitFollowup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || !selected) return;
    const mortality = Math.floor(Number(followupForm.mortality_count) || 0);
    if (!followupForm.week_start_date || mortality < 0) {
      setFormError('Revisá la fecha y las bajas.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await recriaService.recordFollowup(organizationId, selected.id, {
        week_start_date: followupForm.week_start_date,
        average_weight_g:
          followupForm.average_weight_g === '' ? null : Math.floor(Number(followupForm.average_weight_g)),
        mortality_count: mortality,
        mortality_reason: followupForm.mortality_reason,
        feed_stage: followupForm.feed_stage,
        notes: followupForm.notes,
      });
      setFollowupOpen(false);
      setFollowupForm(emptyFollowupForm());
      const refreshed = await recriaService.getAll(organizationId);
      setFlocks(refreshed);
      const updated = refreshed.find((flock) => flock.id === selected.id) ?? selected;
      await loadDetail(updated, { tab: 'seguimiento' });
    } catch (saveError) {
      console.error('Error saving recría followup:', saveError);
      setFormError(
        formatUnknownError(
          saveError,
          'No se pudo guardar el seguimiento. Revisá que las bajas no superen las aves vivas.'
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const submitEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || !selected || !eventForm.description.trim()) {
      setFormError('Indicá una descripción para el evento.');
      return;
    }
    setSaving(true);
    setFormError('');
    setSanidadError('');
    setSanidadSuccess('');
    try {
      const created = await recriaService.createEvent(organizationId, user?.id ?? null, selected.id, {
        event_type: eventForm.event_type,
        description: eventForm.description,
        affected_count: Number(eventForm.affected_count) || 0,
        event_date: eventForm.event_date,
        reminder_date: eventForm.reminder_date,
      });
      setEventOpen(false);
      setEventForm(emptyEventForm());
      await loadDetail(selected, { tab: 'sanidad' });
      const reminderPart = created.reminder_date
        ? ` Próximo recordatorio: ${formatDate(created.reminder_date)}.`
        : '';
      setSanidadSuccess(
        `Evento de ${eventLabel(created.event_type)} guardado.${reminderPart}`
      );
    } catch (saveError) {
      console.error('Error saving recría event:', saveError);
      const message = formatUnknownError(saveError, 'No se pudo guardar el evento sanitario.');
      setFormError(message);
      setSanidadError(message);
    } finally {
      setSaving(false);
    }
  };

  const submitGraduation = async () => {
    if (!organizationId || !selected || !graduateGallineroId) {
      setFormError('Seleccioná el gallinero de destino.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await recriaService.graduate(organizationId, selected.id, graduateGallineroId);
      setGraduateOpen(false);
      setGraduateGallineroId('');
      setSelected(null);
      await load();
    } catch (graduateError) {
      console.error('Error graduating recría flock:', graduateError);
      setFormError('No se pudo graduar la camada. Intentá nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold text-gray-900">Recría</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              Beta
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Seguimiento de camadas antes de su ingreso a producción.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setFormError('');
            setFlockForm(emptyFlockForm());
            setNewFlockOpen(true);
          }}
        >
          <Plus size={18} /> Nueva camada
        </Button>
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {!loading ? (
        <div className="flex flex-wrap gap-2">
          {LIST_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setListFilter(option.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                listFilter === option.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-gray-500">Cargando camadas…</p>
      ) : filteredFlocks.length === 0 ? (
        <Card className="py-12 text-center">
          <Bird className="mx-auto h-10 w-10 text-amber-600" />
          <h3 className="mt-3 text-lg font-semibold text-gray-900">
            {listFilter === 'graduated'
              ? 'No hay camadas graduadas'
              : listFilter === 'all'
                ? 'Todavía no hay camadas en recría'
                : 'Todavía no hay camadas activas'}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {listFilter === 'active'
              ? 'Creá la primera camada para empezar su seguimiento semanal.'
              : listFilter === 'graduated'
                ? 'Las camadas graduadas aparecerán acá con su fecha y el gallinero de destino.'
                : 'Creá una camada o cambiá el filtro para ver otras.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredFlocks.map((flock) => {
            const age = ageForDate(flock);
            const isGraduated = flock.status === 'graduated';
            const destination = flock.graduated_gallinero_id
              ? gallineroById.get(flock.graduated_gallinero_id)
              : undefined;
            return (
              <button
                key={flock.id}
                type="button"
                onClick={() => {
                  setSanidadSuccess('');
                  setSanidadError('');
                  void loadDetail(flock);
                }}
                className="text-left"
              >
                <Card hover className="h-full space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{flock.name}</h3>
                      <p className="text-sm text-gray-600">{flock.breed || 'Raza sin informar'}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        isGraduated
                          ? 'bg-violet-100 text-violet-800'
                          : 'bg-lime-100 text-lime-800'
                      }`}
                    >
                      {isGraduated ? 'Graduada' : 'Activa'}
                    </span>
                  </div>
                  {isGraduated ? (
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-600">
                        Graduada:{' '}
                        <span className="font-medium text-gray-900">{formatDateTime(flock.graduated_at)}</span>
                      </p>
                      {destination ? (
                        <p className="text-gray-600">
                          Gallinero:{' '}
                          <span className="font-medium text-gray-900">{destination.name}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Aves vivas</p>
                        <p className="text-xl font-bold tabular-nums text-gray-900">{flock.current_count}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Edad</p>
                        <p className="text-xl font-bold tabular-nums text-gray-900">{age.weeks} sem.</p>
                      </div>
                    </div>
                  )}
                  {!isGraduated ? (
                    <p className="text-xs text-gray-500">
                      {flock.location_notes || 'Espacio sin informar'}
                      {age.approximate ? ' · edad aproximada' : ''}
                    </p>
                  ) : null}
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <Card className="space-y-5">
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Ficha de camada</p>
              <h3 className="text-2xl font-bold text-gray-900">{selected.name}</h3>
              <p className="mt-1 text-sm text-gray-600">
                {selected.breed || 'Raza sin informar'} · {selected.current_count} aves vivas
                {isClosedFlock ? ' · solo lectura' : ''}
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
              onClick={() => {
                setSelected(null);
                setSanidadSuccess('');
                setSanidadError('');
              }}
            >
              Cerrar ficha
            </button>
          </div>

          <div className="rounded-lg bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              Edad: {selectedAge?.weeks ?? 0} semanas
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {selectedAge?.approximate
                ? 'Edad aproximada, basada en la fecha de ingreso a la granja.'
                : 'Calculada desde la fecha de nacimiento informada.'}
            </p>
          </div>

          {isClosedFlock ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-2">
              <p className="text-sm font-medium text-violet-900">
                Camada graduada el {formatDateTime(selected.graduated_at)}
              </p>
              {selected.graduated_gallinero_id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-violet-800">
                    Gallinero de producción:{' '}
                    <span className="font-medium">
                      {gallineroById.get(selected.graduated_gallinero_id)?.name ?? 'Gallinero'}
                    </span>
                  </p>
                  {onOpenGallinero ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenGallinero(selected.graduated_gallinero_id!)}
                    >
                      Ver gallinero
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-violet-700">
                Historial de seguimiento y sanidad disponible en solo lectura.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-b border-gray-200">
            {(
              isClosedFlock
                ? ([
                    ['seguimiento', 'Seguimiento semanal'],
                    ['sanidad', 'Sanidad'],
                  ] as Array<[DetailTab, string]>)
                : ([
                    ['seguimiento', 'Seguimiento semanal'],
                    ['sanidad', 'Sanidad'],
                    ['graduar', 'Graduar'],
                  ] as Array<[DetailTab, string]>)
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailTab(tab)}
                className={`border-b-2 px-3 py-2 text-sm font-medium ${
                  detailTab === tab
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {detailTab === 'seguimiento' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Etapa actual: <strong>{lastFollowup ? stageLabel(lastFollowup.feed_stage) : 'Sin seguimiento'}</strong>
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={isClosedFlock}
                  onClick={() => {
                    setFormError('');
                    setFollowupForm(emptyFollowupForm());
                    setFollowupOpen(true);
                  }}
                >
                  <ClipboardPlus size={16} /> Cargar semana
                </Button>
              </div>
              {followups.length === 0 ? (
                <p className="text-sm text-gray-500">Aún no hay seguimientos cargados.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-3 py-2">Semana</th>
                        <th className="px-3 py-2">Peso prom.</th>
                        <th className="px-3 py-2">Bajas</th>
                        <th className="px-3 py-2">Alimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followups.map((followup) => (
                        <tr key={followup.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">{formatDate(followup.week_start_date)}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatWeightG(followup.average_weight_g)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {followup.mortality_count || '—'}
                            {followup.mortality_reason ? ` · ${followup.mortality_reason}` : ''}
                          </td>
                          <td className="px-3 py-2">{stageLabel(followup.feed_stage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {detailTab === 'sanidad' ? (
            <div className="space-y-4">
              {sanidadSuccess ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <div className="flex items-start justify-between gap-3">
                    <p>{sanidadSuccess}</p>
                    <button
                      type="button"
                      className="shrink-0 text-emerald-700 underline"
                      onClick={() => setSanidadSuccess('')}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : null}
              {sanidadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <div className="flex items-start justify-between gap-3">
                    <p>{sanidadError}</p>
                    <button
                      type="button"
                      className="shrink-0 text-red-700 underline"
                      onClick={() => setSanidadError('')}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">Eventos sanitarios exclusivos de esta camada.</p>
                <Button
                  type="button"
                  size="sm"
                  disabled={isClosedFlock}
                  onClick={() => {
                    setFormError('');
                    setSanidadError('');
                    setEventForm(emptyEventForm());
                    setEventOpen(true);
                  }}
                >
                  <HeartPulse size={16} /> Registrar evento
                </Button>
              </div>
              {reminderBanner ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    reminderBanner.overdue
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  {reminderBanner.text}
                </div>
              ) : null}
              {healthEvents.length === 0 ? (
                <p className="text-sm text-gray-500">No hay eventos sanitarios cargados.</p>
              ) : (
                <div className="space-y-2">
                  {healthEvents.map((healthEvent) => {
                    const eventAge = ageForDate(selected, healthEvent.event_date);
                    return (
                      <div key={healthEvent.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex justify-between gap-3">
                          <p className="font-medium text-gray-900">{eventLabel(healthEvent.event_type)}</p>
                          <p className="text-xs text-gray-500">{formatDate(healthEvent.event_date)}</p>
                        </div>
                        <p className="mt-1 text-sm text-gray-700">{healthEvent.description}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Semana {eventAge.weeks}
                          {eventAge.approximate ? ' · edad aproximada' : ''}
                          {healthEvent.reminder_date
                            ? ` · Próximo recordatorio: ${formatDate(healthEvent.reminder_date)}`
                            : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {detailTab === 'graduar' ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-lime-50 p-4 text-sm text-lime-900">
                Al graduar se creará una camada activa en el gallinero elegido con las{' '}
                <strong>{selected.current_count} aves vivas</strong>. Recría conservará su historial.
              </div>
              {canManageCoops() ? (
                <Button
                  type="button"
                  variant="success"
                  disabled={selected.current_count <= 0}
                  onClick={() => {
                    setFormError('');
                    setGraduateGallineroId('');
                    setGraduateOpen(true);
                  }}
                >
                  <Sprout size={17} /> Graduar a producción
                </Button>
              ) : (
                <p className="text-sm text-gray-500">Solo un administrador puede graduar una camada.</p>
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Modal isOpen={newFlockOpen} onClose={() => !saving && setNewFlockOpen(false)} title="Nueva camada de recría">
        <form className="space-y-4" onSubmit={submitFlock}>
          <Input label="Nombre / identificador" value={flockForm.name} onChange={(e) => setFlockForm({ ...flockForm, name: e.target.value })} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Raza" value={flockForm.breed} onChange={(e) => setFlockForm({ ...flockForm, breed: e.target.value })} />
            <Input label="Cantidad inicial" type="number" min="1" value={flockForm.initial_count} onChange={(e) => setFlockForm({ ...flockForm, initial_count: e.target.value })} required />
            <Input label="Proveedor" value={flockForm.supplier} onChange={(e) => setFlockForm({ ...flockForm, supplier: e.target.value })} />
            <Input label="Espacio asignado" value={flockForm.location_notes} placeholder="Ej: Galpón recría 1" onChange={(e) => setFlockForm({ ...flockForm, location_notes: e.target.value })} />
            <Input label="Fecha de nacimiento (opcional)" type="date" value={flockForm.birth_date} onChange={(e) => setFlockForm({ ...flockForm, birth_date: e.target.value })} />
            <Input label="Fecha de ingreso" type="date" value={flockForm.entry_date} onChange={(e) => setFlockForm({ ...flockForm, entry_date: e.target.value })} required />
          </div>
          <Input label="Observaciones" value={flockForm.notes} onChange={(e) => setFlockForm({ ...flockForm, notes: e.target.value })} />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setNewFlockOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Crear camada'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={followupOpen} onClose={() => !saving && setFollowupOpen(false)} title="Seguimiento semanal">
        <form className="space-y-4" onSubmit={submitFollowup}>
          <Input label="Inicio de semana" type="date" value={followupForm.week_start_date} onChange={(e) => setFollowupForm({ ...followupForm, week_start_date: e.target.value })} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Peso promedio (g)" type="number" min="1" step="1" value={followupForm.average_weight_g} onChange={(e) => setFollowupForm({ ...followupForm, average_weight_g: e.target.value })} />
            <Input label="Mortalidad del período" type="number" min="0" value={followupForm.mortality_count} onChange={(e) => setFollowupForm({ ...followupForm, mortality_count: e.target.value })} required />
          </div>
          <Input label="Motivo de bajas (opcional)" value={followupForm.mortality_reason} onChange={(e) => setFollowupForm({ ...followupForm, mortality_reason: e.target.value })} />
          <Select label="Etapa de alimento" options={FEED_STAGE_OPTIONS} value={followupForm.feed_stage} onChange={(e) => setFollowupForm({ ...followupForm, feed_stage: e.target.value as RecriaFeedStage })} />
          <Input label="Notas" value={followupForm.notes} onChange={(e) => setFollowupForm({ ...followupForm, notes: e.target.value })} />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFollowupOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar seguimiento'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={eventOpen} onClose={() => !saving && setEventOpen(false)} title="Evento sanitario de recría">
        <form className="space-y-4" onSubmit={submitEvent}>
          <Select label="Tipo" options={HEALTH_EVENT_OPTIONS.map((item) => ({ ...item }))} value={eventForm.event_type} onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value as RecriaEvent['event_type'] })} />
          <Input label="Fecha" type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} required />
          {selected ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Edad al evento: semana {ageForDate(selected, eventForm.event_date).weeks}
              {ageForDate(selected, eventForm.event_date).approximate ? ' (aproximada)' : ''}.
            </p>
          ) : null}
          <Input label="Descripción" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} required />
          <Input label="Aves afectadas (opcional)" type="number" min="0" value={eventForm.affected_count} onChange={(e) => setEventForm({ ...eventForm, affected_count: e.target.value })} />
          <Input label="Próximo recordatorio (opcional)" type="date" value={eventForm.reminder_date} onChange={(e) => setEventForm({ ...eventForm, reminder_date: e.target.value })} />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEventOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar evento'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={graduateOpen} onClose={() => !saving && setGraduateOpen(false)} title="Graduar a producción">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Elegí el gallinero productivo que recibirá la camada. Esta acción no se puede deshacer desde Recría.
          </p>
          <Select
            label="Gallinero de destino"
            options={[
              { value: '', label: 'Seleccioná un gallinero' },
              ...gallineros.map((gallinero) => ({ value: gallinero.id, label: gallinero.name })),
            ]}
            value={graduateGallineroId}
            onChange={(e) => setGraduateGallineroId(e.target.value)}
          />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setGraduateOpen(false)}>Cancelar</Button>
            <Button type="button" variant="success" disabled={saving || !graduateGallineroId} onClick={() => void submitGraduation()}>
              {saving ? 'Graduando…' : 'Confirmar graduación'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
