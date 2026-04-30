import React from 'react';
import { Event, EventType, Gallinero } from '../types';
import { eventsService, eventCalendarDateToDbIso, isSanidadEventType } from '../services/events';
import { gallinerosService } from '../services/gallineros';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'vacunacion', label: 'Vacunación' },
  { value: 'ingreso_pollitas', label: 'Ingreso de Pollitas' },
  { value: 'vitaminas', label: 'Vitaminas' },
  { value: 'medicacion', label: 'Medicación' },
  { value: 'muerte', label: 'Muerte' },
  { value: 'otros', label: 'Otros (Notas)' },
];

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  vacunacion: 'Vacunación',
  ingreso_pollitas: 'Ingreso de Pollitas',
  vitaminas: 'Vitaminas',
  medicacion: 'Medicación',
  muerte: 'Muerte',
  otros: 'Otros',
};

const EVENT_TYPE_VARIANTS: Record<EventType, 'danger' | 'info' | 'warning' | 'success'> = {
  muerte: 'danger',
  vacunacion: 'info',
  ingreso_pollitas: 'success',
  vitaminas: 'warning',
  medicacion: 'warning',
  otros: 'warning',
};

function labelForEventType(t: string): string {
  if (t === 'vacuna') return 'Vacunación';
  if (t === 'observacion') return 'Observación';
  return EVENT_TYPE_LABELS[t as EventType] ?? t;
}

function variantForEventType(t: string): 'danger' | 'info' | 'warning' | 'success' {
  return EVENT_TYPE_VARIANTS[t as EventType] ?? 'warning';
}

interface EventosProps {
  selectedGallineroId: string | null;
}

const DAYS_LOAD = 365 * 8;

function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CR', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function dateInputValue(iso: string): string {
  if (!iso) return '';
  return iso.includes('T') ? iso.split('T')[0] : iso.slice(0, 10);
}

export default function Eventos({ selectedGallineroId }: EventosProps) {
  const { organizationId } = useAuth();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [filterGallineroId, setFilterGallineroId] = React.useState<string | null>(selectedGallineroId);
  const [filterYear, setFilterYear] = React.useState<string>(new Date().getFullYear().toString());
  const [formError, setFormError] = React.useState('');
  const [formData, setFormData] = React.useState({
    date: new Date().toISOString().split('T')[0],
    gallinero_id: '',
    event_type: 'otros' as EventType,
    description: '',
    affected_count: 0,
    reminder_date: '',
    completed: false,
  });

  const loadGallineros = async () => {
    if (!organizationId) return;
    try {
      const data = await gallinerosService.getAll(organizationId);
      setGallineros(data);
    } catch (error) {
      console.error('Error loading gallineros:', error);
    }
  };

  const loadEvents = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const data = await eventsService.getAll(organizationId, DAYS_LOAD);
      setEvents(data);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadGallineros();
  }, [organizationId]);

  React.useEffect(() => {
    if (selectedGallineroId) {
      setFilterGallineroId(selectedGallineroId);
    }
  }, [selectedGallineroId]);

  React.useEffect(() => {
    loadEvents();
  }, [organizationId]);

  const gallineroById = React.useMemo(() => {
    const m = new Map<string, Gallinero>();
    gallineros.forEach((g) => m.set(g.id, g));
    return m;
  }, [gallineros]);

  const yearOptions = React.useMemo(() => {
    const years = new Set<string>();
    years.add(new Date().getFullYear().toString());
    events.forEach((e) => {
      const y = new Date(e.date).getFullYear();
      if (!Number.isNaN(y)) years.add(String(y));
    });
    return Array.from(years)
      .sort((a, b) => b.localeCompare(a))
      .map((y) => ({ value: y, label: y }));
  }, [events]);

  const filteredEvents = React.useMemo(() => {
    let list = events;
    if (filterGallineroId) {
      list = list.filter((e) => e.gallinero_id === filterGallineroId);
    }
    if (filterYear) {
      list = list.filter((e) => String(new Date(e.date).getFullYear()) === filterYear);
    }
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [events, filterGallineroId, filterYear]);

  const filterGallineroOptions = [
    { value: '', label: 'Todos los gallineros' },
    ...gallineros.map((g) => ({
      value: g.id,
      label: `${g.name} (${g.current_count} gallinas)`,
    })),
  ];

  const formGallineroOptions = gallineros.map((g) => ({
    value: g.id,
    label: `${g.name} (${g.current_count} gallinas)`,
  }));

  const needsAffectedCount = (t: EventType) => t === 'muerte' || t === 'ingreso_pollitas';

  const handleOpenModal = (event?: Event) => {
    setFormError('');
    if (event) {
      setEditingId(event.id);
      setFormData({
        date: dateInputValue(event.date),
        gallinero_id: event.gallinero_id,
        event_type: event.event_type,
        description: event.description,
        affected_count: event.affected_count,
        reminder_date: event.reminder_date ? dateInputValue(event.reminder_date) : '',
        completed: event.completed === true,
      });
    } else {
      setEditingId(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        gallinero_id: filterGallineroId || gallineros[0]?.id || '',
        event_type: 'otros',
        description: '',
        affected_count: 0,
        reminder_date: '',
        completed: false,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!organizationId) return;

    if (!formData.gallinero_id) {
      setFormError('Seleccioná el gallinero afectado.');
      return;
    }
    if (!formData.description.trim()) {
      setFormError('La descripción o nota es obligatoria.');
      return;
    }

    const count = Math.max(0, Math.floor(Number(formData.affected_count) || 0));
    if (needsAffectedCount(formData.event_type) && count <= 0) {
      setFormError('Indicá la cantidad de aves (mayor a 0) para Muerte o Ingreso de Pollitas.');
      return;
    }

    const affected = needsAffectedCount(formData.event_type) ? count : 0;
    const dateIso = `${formData.date}T12:00:00.000Z`;

    const sanidad = isSanidadEventType(formData.event_type);
    const reminderDateVal = sanidad && formData.reminder_date.trim() ? formData.reminder_date.trim() : null;

    try {
      if (editingId) {
        await eventsService.update(
          organizationId,
          editingId,
          formData.gallinero_id,
          formData.event_type,
          formData.description.trim(),
          affected,
          dateIso,
          {
            reminder_date: reminderDateVal,
            completed: sanidad ? formData.completed : false,
          }
        );
      } else {
        await eventsService.create(
          organizationId,
          formData.gallinero_id,
          formData.event_type,
          formData.description.trim(),
          affected,
          dateIso,
          reminderDateVal
        );
      }
      await loadGallineros();
      await loadEvents();
      if (formData.date.length >= 4) {
        const y = formData.date.slice(0, 4);
        if (/^\d{4}$/.test(y)) {
          setFilterYear(y);
        }
      }
      handleCloseModal();
    } catch (error: unknown) {
      console.error('Error saving event:', error);
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : '';
      setFormError(
        msg
          ? `No se pudo guardar el evento: ${msg}`
          : 'No se pudo guardar el evento. Revisá los datos o tu conexión.'
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!organizationId) return;
    if (window.confirm('¿Eliminar este evento? El stock de gallinas se revertirá si aplica.')) {
      try {
        await eventsService.delete(organizationId, id);
        await loadGallineros();
        await loadEvents();
      } catch (error) {
        console.error('Error deleting event:', error);
      }
    }
  };

  if (loading && events.length === 0) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Eventos</h2>
          <p className="text-sm text-amber-700 mt-1">Premium · Muertes e ingresos actualizan el stock del gallinero</p>
        </div>
        <Button variant="primary" onClick={() => handleOpenModal()} disabled={gallineros.length === 0}>
          <Plus size={20} />
          Registrar evento
        </Button>
      </div>

      {gallineros.length > 0 && (
        <Card padding="md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Filtrar por gallinero"
              options={filterGallineroOptions}
              value={filterGallineroId || ''}
              onChange={(e) => setFilterGallineroId(e.target.value || null)}
            />
            <Select
              label="Filtrar por año"
              options={yearOptions}
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            />
          </div>
        </Card>
      )}

      {filteredEvents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card padding="md" hover>
            <div>
              <p className="text-sm text-gray-600 mb-1">Eventos en el período</p>
              <p className="text-2xl font-bold text-gray-900">{filteredEvents.length}</p>
            </div>
          </Card>

          <Card padding="md" hover>
            <div>
              <p className="text-sm text-gray-600 mb-1">Bajas (aves)</p>
              <p className="text-2xl font-bold text-red-600">
                {filteredEvents
                  .filter((e) => e.event_type === 'muerte')
                  .reduce((sum, e) => sum + e.affected_count, 0)}
              </p>
            </div>
          </Card>

          <Card padding="md" hover>
            <div>
              <p className="text-sm text-gray-600 mb-1">Ingresos (pollitas)</p>
              <p className="text-2xl font-bold text-green-700">
                {filteredEvents
                  .filter((e) => e.event_type === 'ingreso_pollitas')
                  .reduce((sum, e) => sum + e.affected_count, 0)}
              </p>
            </div>
          </Card>
        </div>
      )}

      <Card padding="md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Línea de tiempo</h3>
        {filteredEvents.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay eventos para los filtros seleccionados.</p>
        ) : (
          <ul className="space-y-0 border-l-2 border-gray-200 ml-3 pl-6 py-1">
            {filteredEvents.map((ev) => {
              const g = gallineroById.get(ev.gallinero_id);
              return (
                <li key={ev.id} className="relative pb-8 last:pb-0">
                  <span
                    className="absolute -left-[29px] top-1.5 h-3 w-3 rounded-full bg-white ring-2 ring-gray-300"
                    aria-hidden
                  />
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-500">{formatEventDate(ev.date)}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge label={labelForEventType(ev.event_type)} variant={variantForEventType(ev.event_type)} />
                        <span className="text-sm font-medium text-gray-900">{g?.name ?? 'Gallinero'}</span>
                      </div>
                      <p className="text-gray-700 mt-2 whitespace-pre-wrap">{ev.description}</p>
                      {needsAffectedCount(ev.event_type as EventType) && ev.affected_count > 0 && (
                        <p className="text-sm text-gray-600 mt-1">
                          Cantidad: <span className="font-medium">{ev.affected_count}</span> aves
                        </p>
                      )}
                      {isSanidadEventType(ev.event_type as EventType) && ev.reminder_date && (
                        <p className="text-sm text-teal-800 mt-2">
                          Próxima aplicación:{' '}
                          <span className="font-medium">
                            {formatEventDate(`${String(ev.reminder_date).slice(0, 10)}T12:00:00.000Z`)}
                          </span>
                          {ev.completed ? (
                            <span className="ml-2 text-gray-500">· Completado</span>
                          ) : null}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="secondary" size="sm" onClick={() => handleOpenModal(ev)}>
                        <Pencil size={16} aria-hidden />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(ev.id)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Editar evento' : 'Registrar evento'}
      >
        <form key={editingId ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{formError}</p>
            </div>
          )}

          <Input
            label="Fecha"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          <Select
            label="Gallinero afectado"
            options={formGallineroOptions}
            value={formData.gallinero_id}
            onChange={(e) => setFormData({ ...formData, gallinero_id: e.target.value })}
            required
          />

          <Select
            label="Tipo de evento"
            options={EVENT_TYPE_OPTIONS}
            value={formData.event_type}
            onChange={(e) => setFormData({ ...formData, event_type: e.target.value as EventType })}
            required
          />

          <Input
            label="Descripción / nota"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Detalle del evento"
            required
          />

          {needsAffectedCount(formData.event_type) && (
            <Input
              label={formData.event_type === 'muerte' ? 'Cantidad de bajas' : 'Cantidad de pollitas ingresadas'}
              type="number"
              min={1}
              value={formData.affected_count || ''}
              onChange={(e) =>
                setFormData({ ...formData, affected_count: parseInt(e.target.value, 10) || 0 })
              }
              required
            />
          )}

          {isSanidadEventType(formData.event_type) && (
            <Input
              label="Próxima aplicación (recordatorio)"
              type="date"
              value={formData.reminder_date}
              onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
            />
          )}

          {isSanidadEventType(formData.event_type) && editingId && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={formData.completed}
                onChange={(e) => setFormData({ ...formData, completed: e.target.checked })}
              />
              <span className="text-sm text-gray-700">Recordatorio ya realizado</span>
            </label>
          )}

          <div className="flex gap-2 pt-4">
            <Button variant="primary" type="submit" className="flex-1">
              Guardar
            </Button>
            <Button variant="secondary" type="button" onClick={handleCloseModal} className="flex-1">
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
