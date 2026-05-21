import React from 'react';
import { Gallinero, ProductionRecord } from '../types';
import { gallinerosService } from '../services/gallineros';
import { productionService, productionFormDateToDbDate, computeLayingPercentage } from '../services/production';
import { feedLogsService } from '../services/feedLogs';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';
import { useBumpDashboardMetrics } from '../contexts/DashboardMetricsRefreshContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { todayLocalYmd } from '../utils/monthToDateFinance';

interface Produccion {
  selectedGallineroId: string | null;
}

function toDateInputValue(raw: string): string {
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw.slice(0, 10);
}

const LAST_BAG_KG_KEY = 'produccion_last_feed_bag_kg';

function getSavedKgPorBolsa(): number {
  if (typeof window === 'undefined') return 25;
  const raw = window.localStorage.getItem(LAST_BAG_KG_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

export default function Produccion({ selectedGallineroId }: Produccion) {
  const { organizationId } = useAuth();
  const { canLogProduction } = useRole();
  const bumpDashboardMetrics = useBumpDashboardMetrics();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [production, setProduction] = React.useState<ProductionRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isFeedLogModalOpen, setIsFeedLogModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [currentGallineroId, setCurrentGallineroId] = React.useState(selectedGallineroId);
  const [error, setError] = React.useState<string>('');
  const [duplicateInfo, setDuplicateInfo] = React.useState<{ gallineroId: string; date: string } | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    String(new Date().getMonth() + 1).padStart(2, '0')
  );
  const [feedConsumoTipo, setFeedConsumoTipo] = React.useState<'bolsas' | 'granel'>('bolsas');
  const [feedCantidadBolsas, setFeedCantidadBolsas] = React.useState(0);
  const [feedKgPorBolsa, setFeedKgPorBolsa] = React.useState<number>(() => getSavedKgPorBolsa());
  const [feedKgGranel, setFeedKgGranel] = React.useState(0);
  const [feedLogDate, setFeedLogDate] = React.useState(() => todayLocalYmd());
  const [feedLogSaving, setFeedLogSaving] = React.useState(false);
  const [feedLogError, setFeedLogError] = React.useState('');
  const [formData, setFormData] = React.useState({
    gallinero_id: selectedGallineroId || '',
    date: todayLocalYmd(),
    eggs_count: 0,
    broken_dirty_eggs_count: 0,
    notes: '',
    /** Población histórica guardada en el registro (solo edición) */
    poultry_count: 0,
  });

  const loadGallineros = async () => {
    if (!organizationId) return;
    try {
      const data = await gallinerosService.getAll(organizationId);
      setGallineros(data);
      if (data.length > 0) {
        const defaultGallineroId = selectedGallineroId || data[0].id;
        if (!selectedGallineroId) {
          setCurrentGallineroId(defaultGallineroId);
        }
        setFormData((prev) => ({
          ...prev,
          gallinero_id: prev.gallinero_id || defaultGallineroId,
        }));
      }
    } catch (error) {
      console.error('Error loading gallineros:', error);
    }
  };

  const loadProduction = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const fromDate = `${selectedYear}-${selectedMonth}-01`;
      const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate();
      const toDate = `${selectedYear}-${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      const data = currentGallineroId
        ? await productionService.getByGallineroRange(organizationId, currentGallineroId, fromDate, toDate)
        : await productionService.getAllRange(organizationId, fromDate, toDate);
      setProduction(data);
    } catch (error) {
      console.error('Error loading production:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadGallineros();
  }, [organizationId]);

  React.useEffect(() => {
    if (selectedGallineroId) {
      setCurrentGallineroId(selectedGallineroId);
      setFormData((prev) => ({ ...prev, gallinero_id: selectedGallineroId }));
    }
  }, [selectedGallineroId]);

  React.useEffect(() => {
    if (currentGallineroId) {
      loadProduction();
    }
  }, [currentGallineroId, organizationId, selectedYear, selectedMonth]);

  const handleOpenModal = (record?: ProductionRecord) => {
    if (!canLogProduction()) return;
    setError('');
    if (record) {
      setEditingId(record.id);
      setFormData({
        gallinero_id: record.gallinero_id,
        date: toDateInputValue(record.date),
        eggs_count: record.eggs_count,
        broken_dirty_eggs_count: record.broken_dirty_eggs_count || 0,
        notes: record.notes || '',
        poultry_count: record.poultry_count ?? 0,
      });
    } else {
      setEditingId(null);
      setFormData({
        gallinero_id: currentGallineroId || gallineros[0]?.id || '',
        date: todayLocalYmd(),
        eggs_count: 0,
        broken_dirty_eggs_count: 0,
        notes: '',
        poultry_count: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setError('');
    setDuplicateInfo(null);
  };

  const resetFeedConsumoForm = React.useCallback(() => {
    setFeedConsumoTipo('bolsas');
    setFeedCantidadBolsas(0);
    setFeedKgPorBolsa(getSavedKgPorBolsa());
    setFeedKgGranel(0);
    setFeedLogDate(todayLocalYmd());
  }, []);

  const feedTotalKgComputed =
    feedConsumoTipo === 'bolsas'
      ? Math.max(0, Math.floor(feedCantidadBolsas)) * Math.max(0, feedKgPorBolsa)
      : Math.max(0, feedKgGranel);

  const isFeedConsumoFormValid = React.useMemo(() => {
    if (!feedLogDate?.trim()) return false;
    if (feedConsumoTipo === 'bolsas') {
      const n = Math.floor(feedCantidadBolsas);
      const kg = feedKgPorBolsa;
      return n >= 1 && Number.isFinite(kg) && kg > 0 && Number.isFinite(n * kg) && n * kg > 0;
    }
    return Number.isFinite(feedKgGranel) && feedKgGranel > 0;
  }, [
    feedLogDate,
    feedConsumoTipo,
    feedCantidadBolsas,
    feedKgPorBolsa,
    feedKgGranel,
  ]);

  const handleCloseFeedLogModal = () => {
    setIsFeedLogModalOpen(false);
    setFeedLogError('');
    resetFeedConsumoForm();
  };

  const handleSaveFeedLog = async () => {
    if (!canLogProduction() || !organizationId) return;
    if (!currentGallineroId) {
      setFeedLogError('Seleccioná un gallinero para registrar el consumo.');
      return;
    }
    if (!isFeedConsumoFormValid) {
      setFeedLogError('Completá todos los campos obligatorios.');
      return;
    }
    const totalKg =
      feedConsumoTipo === 'bolsas'
        ? Math.max(0, Math.floor(feedCantidadBolsas)) * Math.max(0, feedKgPorBolsa)
        : Math.max(0, feedKgGranel);
    if (!Number.isFinite(totalKg) || totalKg <= 0) {
      setFeedLogError('Revisá los kg ingresados.');
      return;
    }
    try {
      setFeedLogSaving(true);
      const logDate = feedLogDate.trim().slice(0, 10);
      if (feedConsumoTipo === 'bolsas') {
        await feedLogsService.create(organizationId, currentGallineroId, logDate, totalKg, {
          tipo: 'bolsas',
          cantidad_bolsas: Math.floor(feedCantidadBolsas),
          kg_por_bolsa: feedKgPorBolsa,
        });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_BAG_KG_KEY, String(feedKgPorBolsa));
        }
      } else {
        await feedLogsService.create(organizationId, currentGallineroId, logDate, totalKg, {
          tipo: 'granel',
        });
      }
      bumpDashboardMetrics();
      handleCloseFeedLogModal();
    } catch (error) {
      console.error('Error saving feed log:', error);
      setFeedLogError('No se pudo guardar el consumo de alimento.');
    } finally {
      setFeedLogSaving(false);
    }
  };

  const findExistingRecordForDate = async (gallineroId: string, date: string) => {
    if (!organizationId) return null;
    const ymd = productionFormDateToDbDate(date);
    // Si coincide con el gallinero actual, usamos lo ya cargado (evita requests).
    if (gallineroId === currentGallineroId) {
      return production.find((r) => toDateInputValue(r.date) === ymd) ?? null;
    }
    // Query directa por fecha para evitar descargar años.
    return await productionService.getByGallineroAndDate(organizationId, gallineroId, ymd);
  };

  const handleEditExistingForDuplicate = async () => {
    if (!organizationId || !duplicateInfo) return;
    try {
      const existing = await findExistingRecordForDate(duplicateInfo.gallineroId, duplicateInfo.date);
      if (existing) {
        handleOpenModal(existing);
      } else {
        setError('No se encontró el registro existente para editar. Actualizá la lista e intentá de nuevo.');
      }
    } catch (e) {
      console.error('Error loading existing production record:', e);
      setError('No se pudo cargar el registro existente para editar.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLogProduction()) return;
    setError('');
    setDuplicateInfo(null);

    if (!organizationId) {
      setError('Sesión no válida');
      return;
    }

    if (!formData.gallinero_id) {
      setError('Debes seleccionar un gallinero primero');
      return;
    }

    let dateYmd: string;
    try {
      dateYmd = productionFormDateToDbDate(formData.date);
    } catch {
      setError('La fecha no es válida.');
      return;
    }

    try {
      const gallinero = gallineros.find((g) => g.id === formData.gallinero_id);
      if (!gallinero) {
        setError('Gallinero no encontrado');
        return;
      }

      // Pre-chequeo para evitar 409 por duplicado (mismo gallinero + misma fecha).
      const existingSameDay = await findExistingRecordForDate(formData.gallinero_id, dateYmd);
      if (!editingId && existingSameDay) {
        setDuplicateInfo({ gallineroId: formData.gallinero_id, date: dateYmd });
        setError(
          'Ya existe un registro de producción para este gallinero y esta fecha. ' +
            'Podés editar el registro existente.'
        );
        return;
      }
      if (editingId && existingSameDay && existingSameDay.id !== editingId) {
        setDuplicateInfo({ gallineroId: formData.gallinero_id, date: dateYmd });
        setError(
          'Ya existe otro registro para este gallinero y esta fecha. Elegí otra fecha o editá ese registro.'
        );
        return;
      }

      if (editingId) {
        await productionService.update(
          organizationId,
          editingId,
          dateYmd,
          formData.eggs_count,
          formData.broken_dirty_eggs_count,
          formData.poultry_count,
          formData.notes
        );
      } else {
        await productionService.create(
          organizationId,
          formData.gallinero_id,
          dateYmd,
          formData.eggs_count,
          formData.broken_dirty_eggs_count,
          gallinero.current_count,
          formData.notes
        );
      }
      setCurrentGallineroId(formData.gallinero_id);
      await loadProduction();
      bumpDashboardMetrics();
      handleCloseModal();
    } catch (error: any) {
      const message: string =
        (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : '') || '';

      if (message.includes('production_records_org_gallinero_date_uniq')) {
        setDuplicateInfo({ gallineroId: formData.gallinero_id, date: dateYmd });
        setError(
          'Ya existe un registro de producción para este gallinero y esta fecha. ' +
            'Podés editar el registro existente.'
        );
      } else {
        console.error('Error saving production:', error);
        setError('Error al guardar. Intenta de nuevo.');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!canLogProduction() || !organizationId) return;
    if (window.confirm('¿Está seguro?')) {
      try {
        await productionService.delete(organizationId, id);
        await loadProduction();
        bumpDashboardMetrics();
      } catch (error) {
        console.error('Error deleting production:', error);
      }
    }
  };

  const gallineroOptions = [
    { value: '', label: 'Todos los gallineros' },
    ...gallineros.map((g) => ({
      value: g.id,
      label: `${g.name} (${g.current_count} gallinas)`,
    })),
  ];
  const gallineroForForm = gallineros.find((g) => g.id === formData.gallinero_id);
  const snapshotGallinasNuevo = gallineroForForm?.current_count ?? 0;
  const isPostureOver100 =
    snapshotGallinasNuevo > 0 && formData.eggs_count > snapshotGallinasNuevo;

  const getRecordHens = (record: ProductionRecord) =>
    record.poultry_count && record.poultry_count > 0
      ? record.poultry_count
      : gallineros.find((g) => g.id === record.gallinero_id)?.current_count ?? 0;

  const avgLayingPercentage =
    production.length > 0
      ? production.reduce(
          (sum, record) =>
            sum + computeLayingPercentage(record.eggs_count, getRecordHens(record)),
          0
        ) / production.length
      : 0;

  if (loading && currentGallineroId) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-3xl font-bold text-gray-900">Producción Diaria</h2>
        <div className="flex flex-wrap gap-2">
          {canLogProduction() ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setFeedLogError('');
                  resetFeedConsumoForm();
                  setIsFeedLogModalOpen(true);
                }}
                disabled={!currentGallineroId}
                title={!currentGallineroId ? 'Seleccioná un gallinero para registrar consumo.' : undefined}
              >
                <Package size={18} />
                Registrar Consumo
              </Button>
              <Button variant="primary" onClick={() => handleOpenModal()}>
                <Plus size={20} />
                Nueva Recolección
              </Button>
            </>
          ) : (
            <p className="text-sm text-gray-500 self-center">Solo lectura · registro de producción solo para admin u operario.</p>
          )}
        </div>
      </div>

      {gallineros.length > 0 && (
        <Card padding="md">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Seleccionar Gallinero"
              options={gallineroOptions}
              value={currentGallineroId || ''}
              onChange={(e) => setCurrentGallineroId(e.target.value || null)}
            />
            <Select
              label="Año"
              options={Array.from({ length: 6 }).map((_, i) => {
                const y = String(new Date().getFullYear() - i);
                return { value: y, label: y };
              })}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            />
            <Select
              label="Mes"
              options={[
                { value: '01', label: 'Enero' },
                { value: '02', label: 'Febrero' },
                { value: '03', label: 'Marzo' },
                { value: '04', label: 'Abril' },
                { value: '05', label: 'Mayo' },
                { value: '06', label: 'Junio' },
                { value: '07', label: 'Julio' },
                { value: '08', label: 'Agosto' },
                { value: '09', label: 'Septiembre' },
                { value: '10', label: 'Octubre' },
                { value: '11', label: 'Noviembre' },
                { value: '12', label: 'Diciembre' },
              ]}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
        </Card>
      )}

      {(currentGallineroId !== undefined) && (
        <>
          {production.length > 0 && (
            <Card padding="md">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Promedio Postura</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {avgLayingPercentage.toFixed(1)}
                      %
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Huevos (30 días)</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {production.reduce((sum, p) => sum + p.eggs_count, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Últimos Registros</p>
                    <p className="text-2xl font-bold text-gray-900">{production.length}</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card padding="none">
            <Table
              columns={[
                { key: 'date', label: 'Fecha' },
                ...(currentGallineroId
                  ? []
                  : [
                      {
                        key: 'gallinero_id',
                        label: 'Gallinero',
                        render: (value: unknown) => gallineros.find((g) => g.id === value)?.name || '—',
                      },
                    ]),
                { key: 'eggs_count', label: 'Huevos' },
                {
                  key: 'laying_percentage',
                  label: '% Postura',
                  render: (_: unknown, row: ProductionRecord) =>
                    `${computeLayingPercentage(row.eggs_count, getRecordHens(row)).toFixed(1)}%`,
                },
                {
                  key: 'notes',
                  label: 'Notas',
                  render: (value: unknown) => value || '-',
                },
                ...(canLogProduction()
                  ? [
                      {
                        key: 'id',
                        label: 'Acciones',
                        render: (_: unknown, row: ProductionRecord) => (
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenModal(row)}
                            >
                              <Pencil size={16} aria-hidden />
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => handleDelete(row.id)}>
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
              data={production}
            />
          </Card>
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Editar Registro' : 'Nuevo Registro de Producción'}
      >
        <form key={editingId ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="space-y-2">
                <p className="text-sm text-red-800">{error}</p>
                {duplicateInfo && (
                  <Button type="button" variant="secondary" size="sm" onClick={handleEditExistingForDuplicate}>
                    Editar registro existente
                  </Button>
                )}
              </div>
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
            label="Gallinero"
            options={gallineroOptions}
            value={formData.gallinero_id}
            onChange={(e) => {
              setError('');
              setDuplicateInfo(null);
              setFormData({ ...formData, gallinero_id: e.target.value });
            }}
            required
            disabled={!!editingId}
          />

          {editingId ? (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Gallinas en ese momento:</span> {formData.poultry_count}. El % de postura
                de este día se calcula con ese número; las bajas posteriores no lo cambian.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Se guardará la población actual:</span> {snapshotGallinasNuevo}{' '}
                gallinas (según el gallinero elegido al guardar).
              </p>
            </div>
          )}

          <Input
            label="Cantidad de Huevos"
            type="number"
            value={formData.eggs_count}
            onChange={(e) => setFormData({ ...formData, eggs_count: parseInt(e.target.value) || 0 })}
            required
          />

          {isPostureOver100 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg">
              <p className="text-sm text-amber-900">
                <span className="font-semibold">¡Atención!</span> Estás ingresando más huevos que la cantidad de
                gallinas disponibles (porcentaje de postura mayor al 100%). Revisá si el conteo es correcto.
              </p>
            </div>
          )}

          <Input
            label="Cantidad de Huevos Rotos/Sucios"
            type="number"
            value={formData.broken_dirty_eggs_count}
            onChange={(e) =>
              setFormData({
                ...formData,
                broken_dirty_eggs_count: parseInt(e.target.value) || 0,
              })
            }
            required
          />

          <Input
            label="Observaciones"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Ej: Clima cálido, pocos huevos"
          />

          <div className="flex gap-2 pt-4">
            <Button variant="primary" type="submit" className="flex-1">
              Guardar
            </Button>
            <Button variant="secondary" onClick={handleCloseModal} className="flex-1">
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isFeedLogModalOpen} onClose={handleCloseFeedLogModal} title="Registrar consumo de alimento">
        <div className="space-y-4">
          <Select
            label="Tipo de compra"
            options={[
              { value: 'bolsas', label: 'Bolsas' },
              { value: 'granel', label: 'Granel' },
            ]}
            value={feedConsumoTipo}
            onChange={(e) => {
              const v = e.target.value as 'bolsas' | 'granel';
              setFeedConsumoTipo(v);
              if (v === 'bolsas') {
                setFeedKgGranel(0);
              } else {
                setFeedCantidadBolsas(0);
              }
            }}
            required
          />

          {feedConsumoTipo === 'bolsas' ? (
            <>
              <Input
                label="Cantidad de bolsas"
                type="number"
                step="1"
                min="1"
                inputMode="numeric"
                value={feedCantidadBolsas || ''}
                onChange={(e) => setFeedCantidadBolsas(parseInt(e.target.value, 10) || 0)}
                required
              />
              <Input
                label="Kg por bolsa"
                type="number"
                step="0.01"
                min="0"
                value={feedKgPorBolsa}
                onChange={(e) => setFeedKgPorBolsa(parseFloat(e.target.value) || 0)}
                helperText="Se recuerda el último valor para la próxima vez."
                required
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-700 mb-1">Total kg</p>
                <p className="text-lg font-semibold tabular-nums text-gray-900">
                  {Number.isFinite(feedTotalKgComputed) ? feedTotalKgComputed.toFixed(2) : '0.00'} kg
                </p>
                <p className="mt-1 text-xs text-gray-500">Cantidad de bolsas × kg por bolsa (solo lectura)</p>
              </div>
            </>
          ) : (
            <Input
              label="Kg totales"
              type="number"
              step="0.01"
              min="0"
              value={feedKgGranel}
              onChange={(e) => setFeedKgGranel(parseFloat(e.target.value) || 0)}
              required
            />
          )}

          <Input
            label="Fecha de apertura / ingreso"
            type="date"
            value={feedLogDate}
            onChange={(e) => setFeedLogDate(e.target.value)}
            required
          />

          {feedLogError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {feedLogError}
            </div>
          ) : null}
          <div className="flex gap-2 pt-2">
            <Button
              variant="primary"
              onClick={handleSaveFeedLog}
              className="flex-1"
              disabled={feedLogSaving || !isFeedConsumoFormValid}
            >
              {feedLogSaving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="secondary" onClick={handleCloseFeedLogModal} className="flex-1" disabled={feedLogSaving}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
