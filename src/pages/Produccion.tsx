import React from 'react';
import { Gallinero, Page, ProductionRecord } from '../types';
import { gallinerosService } from '../services/gallineros';
import { productionService, productionFormDateToDbDate, computeLayingPercentage } from '../services/production';
import { feedLogsService } from '../services/feedLogs';
import {
  inventoryStockService,
  type FeedInventorySnapshot,
} from '../services/inventoryStock';
import { formatFeedReachFromToday, formatUnknownError } from '../services/inventoryStockCalc';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';
import { useBumpDashboardMetrics } from '../contexts/DashboardMetricsRefreshContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react';
import { todayLocalYmd } from '../utils/monthToDateFinance';
import { numberInputValue, parseFormFloat, parseFormInt } from '../utils/formNumbers';
import { distributeFeedKgByGallinero } from '../utils/distributeFeedKg';
import DeclareMonthlyFeedModal from '../components/DeclareMonthlyFeedModal';

const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

interface ProduccionProps {
  selectedGallineroId: string | null;
  onNavigate?: (page: Page) => void;
  consumptionFocus?: { year: number; month: number; openMonthlyModal?: boolean } | null;
  onConsumptionFocusConsumed?: () => void;
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

export default function Produccion({
  selectedGallineroId,
  onNavigate,
  consumptionFocus,
  onConsumptionFocusConsumed,
}: ProduccionProps) {
  const { organizationId } = useAuth();
  const { canLogProduction } = useRole();
  const bumpDashboardMetrics = useBumpDashboardMetrics();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [production, setProduction] = React.useState<ProductionRecord[]>([]);
  const [feedSnapshot, setFeedSnapshot] = React.useState<FeedInventorySnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isFeedLogModalOpen, setIsFeedLogModalOpen] = React.useState(false);
  const [feedStockWarning, setFeedStockWarning] = React.useState(false);
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
  const [feedGallineroTarget, setFeedGallineroTarget] = React.useState<string>('all');
  const [feedLogSaving, setFeedLogSaving] = React.useState(false);
  const [feedLogError, setFeedLogError] = React.useState('');
  const [feedLogSuccess, setFeedLogSuccess] = React.useState('');
  const [isMonthlyFeedModalOpen, setIsMonthlyFeedModalOpen] = React.useState(false);
  const [monthlyFeedFocus, setMonthlyFeedFocus] = React.useState<{
    year?: number;
    month?: number;
  } | null>(null);
  const [monthlyFeedSuccess, setMonthlyFeedSuccess] = React.useState('');
  const [clasificarPorTamano, setClasificarPorTamano] = React.useState(false);
  const [formData, setFormData] = React.useState({
    gallinero_id: selectedGallineroId || '',
    date: todayLocalYmd(),
    eggs_count: 0,
    broken_dirty_eggs_count: 0,
    notes: '',
    /** Población histórica guardada en el registro (solo edición) */
    poultry_count: 0,
    eggs_large: 0,
    eggs_medium: 0,
    eggs_small: 0,
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

  const loadFeedSnapshot = React.useCallback(async () => {
    if (!organizationId) {
      setFeedSnapshot(null);
      return;
    }
    try {
      const feed = await inventoryStockService.loadFeedInventory(organizationId);
      setFeedSnapshot(feed);
    } catch (error) {
      console.error('Error loading feed snapshot:', error);
      setFeedSnapshot(null);
    }
  }, [organizationId]);

  React.useEffect(() => {
    loadGallineros();
  }, [organizationId]);

  React.useEffect(() => {
    loadFeedSnapshot();
  }, [loadFeedSnapshot]);

  React.useEffect(() => {
    if (!consumptionFocus) return;
    const y = Number(consumptionFocus.year);
    const m = Number(consumptionFocus.month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      onConsumptionFocusConsumed?.();
      return;
    }
    if (consumptionFocus.openMonthlyModal) {
      setMonthlyFeedSuccess('');
      setMonthlyFeedFocus({ year: y, month: m });
      setIsMonthlyFeedModalOpen(true);
    }
    onConsumptionFocusConsumed?.();
  }, [consumptionFocus, onConsumptionFocusConsumed]);

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
      const hasSize =
        record.eggs_large != null || record.eggs_medium != null || record.eggs_small != null;
      setClasificarPorTamano(hasSize);
      setEditingId(record.id);
      setFormData({
        gallinero_id: record.gallinero_id,
        date: toDateInputValue(record.date),
        eggs_count: record.eggs_count,
        broken_dirty_eggs_count: record.broken_dirty_eggs_count || 0,
        notes: record.notes || '',
        poultry_count: record.poultry_count ?? 0,
        eggs_large: record.eggs_large ?? 0,
        eggs_medium: record.eggs_medium ?? 0,
        eggs_small: record.eggs_small ?? 0,
      });
    } else {
      setClasificarPorTamano(false);
      setEditingId(null);
      setFormData({
        gallinero_id: currentGallineroId || gallineros[0]?.id || '',
        date: todayLocalYmd(),
        eggs_count: 0,
        broken_dirty_eggs_count: 0,
        notes: '',
        poultry_count: 0,
        eggs_large: 0,
        eggs_medium: 0,
        eggs_small: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setClasificarPorTamano(false);
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

  const feedGallineroSelectOptions = React.useMemo(
    () => [
      { value: 'all', label: 'Toda la granja (distribuir)' },
      ...gallineros.map((g) => ({ value: g.id, label: g.name })),
    ],
    [gallineros]
  );

  const openFeedLogModal = () => {
    setFeedLogError('');
    setFeedLogSuccess('');
    resetFeedConsumoForm();
    setFeedGallineroTarget(currentGallineroId ?? 'all');
    setIsFeedLogModalOpen(true);
  };

  const isFeedConsumoFormValid = React.useMemo(() => {
    if (!feedLogDate?.trim()) return false;
    if (!feedGallineroTarget) return false;
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
    feedGallineroTarget,
  ]);

  const handleCloseFeedLogModal = () => {
    setIsFeedLogModalOpen(false);
    setFeedLogError('');
    setFeedStockWarning(false);
    resetFeedConsumoForm();
  };

  const persistFeedLog = async (): Promise<boolean> => {
    if (!canLogProduction()) {
      setFeedLogError('No tenés permiso para registrar consumo.');
      return false;
    }
    if (!organizationId) {
      setFeedLogError('Sesión no válida. Volvé a iniciar sesión e intentá de nuevo.');
      return false;
    }
    if (!isFeedConsumoFormValid) {
      setFeedLogError('Completá todos los campos obligatorios.');
      return false;
    }
    const totalKg =
      feedConsumoTipo === 'bolsas'
        ? Math.max(0, Math.floor(feedCantidadBolsas)) * Math.max(0, feedKgPorBolsa)
        : Math.max(0, feedKgGranel);
    if (!Number.isFinite(totalKg) || totalKg <= 0) {
      setFeedLogError('Revisá los kg ingresados.');
      return false;
    }
    try {
      setFeedLogSaving(true);
      setFeedLogError('');
      const logDate = feedLogDate.trim().slice(0, 10);
      const metaBolsas =
        feedConsumoTipo === 'bolsas'
          ? {
              tipo: 'bolsas' as const,
              cantidad_bolsas: Math.floor(feedCantidadBolsas),
              kg_por_bolsa: feedKgPorBolsa,
            }
          : { tipo: 'granel' as const };

      if (feedGallineroTarget === 'all') {
        const shares = distributeFeedKgByGallinero(totalKg, gallineros);
        if (shares.length === 0) {
          setFeedLogError('No hay gallineros con gallinas para distribuir el consumo.');
          return false;
        }
        await Promise.all(
          shares.map(({ gallineroId, kg }) =>
            feedLogsService.create(organizationId, gallineroId, logDate, kg, {
              tipo: feedConsumoTipo,
              ...(feedConsumoTipo === 'bolsas'
                ? {
                    cantidad_bolsas: Math.floor(feedCantidadBolsas),
                    kg_por_bolsa: feedKgPorBolsa,
                  }
                : {}),
            })
          )
        );
        if (feedConsumoTipo === 'bolsas' && typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_BAG_KG_KEY, String(feedKgPorBolsa));
        }
      } else if (feedConsumoTipo === 'bolsas') {
        await feedLogsService.create(organizationId, feedGallineroTarget, logDate, totalKg, metaBolsas);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_BAG_KG_KEY, String(feedKgPorBolsa));
        }
      } else {
        await feedLogsService.create(organizationId, feedGallineroTarget, logDate, totalKg, metaBolsas);
      }

      const gallineroLabel =
        feedGallineroTarget === 'all'
          ? 'toda la granja'
          : gallineros.find((g) => g.id === feedGallineroTarget)?.name || 'el gallinero';
      bumpDashboardMetrics();
      setFeedStockWarning(false);
      await loadFeedSnapshot();
      handleCloseFeedLogModal();
      setFeedLogSuccess(
        `Consumo diario de ${totalKg.toFixed(1)} kg registrado en ${gallineroLabel} (${logDate}).`
      );
      return true;
    } catch (error) {
      console.error('Error saving feed log:', error);
      setFeedLogError(
        formatUnknownError(
          error,
          'No se pudo guardar el consumo de alimento. Revisá la conexión e intentá de nuevo.'
        )
      );
      return false;
    } finally {
      setFeedLogSaving(false);
    }
  };

  const handleSaveFeedLog = async () => {
    if (!canLogProduction()) {
      setFeedLogError('No tenés permiso para registrar consumo.');
      return;
    }
    if (!organizationId) {
      setFeedLogError('Sesión no válida. Volvé a iniciar sesión e intentá de nuevo.');
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

    setFeedLogSaving(true);
    setFeedLogError('');
    try {
      const feedInv = await inventoryStockService.loadFeedInventory(organizationId);
      // Tolerancia mínima por redondeo; igual al stock disponible no debe advertir.
      if (feedInv.stockKg <= 0 || totalKg > feedInv.stockKg + 0.001) {
        setFeedStockWarning(true);
        setFeedLogError(
          `Stock disponible: ${feedInv.stockKg.toFixed(1)} kg. Este consumo pide ${totalKg.toFixed(1)} kg.`
        );
        setFeedLogSaving(false);
        return;
      }
    } catch (error) {
      console.error('Error checking feed stock before log:', error);
      // Si falla el chequeo de stock, no bloquear el registro operativo.
    }

    await persistFeedLog();
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

      const eggsLarge = clasificarPorTamano ? formData.eggs_large || 0 : null;
      const eggsMedium = clasificarPorTamano ? formData.eggs_medium || 0 : null;
      const eggsSmall = clasificarPorTamano ? formData.eggs_small || 0 : null;
      // Optional field: empty/untouched → 0 (matches NOT NULL DEFAULT 0)
      const brokenDirtyEggsCount = formData.broken_dirty_eggs_count || 0;

      if (editingId) {
        await productionService.update(
          organizationId,
          editingId,
          dateYmd,
          formData.eggs_count,
          brokenDirtyEggsCount,
          formData.poultry_count,
          formData.notes,
          eggsLarge,
          eggsMedium,
          eggsSmall
        );
      } else {
        await productionService.create(
          organizationId,
          formData.gallinero_id,
          dateYmd,
          formData.eggs_count,
          brokenDirtyEggsCount,
          gallinero.current_count,
          formData.notes,
          eggsLarge,
          eggsMedium,
          eggsSmall
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
                type="button"
                onClick={() => {
                  setMonthlyFeedSuccess('');
                  setMonthlyFeedFocus(null);
                  setIsMonthlyFeedModalOpen(true);
                }}
              >
                <Wallet size={18} />
                Declarar consumo del mes
              </Button>
              <Button variant="primary" type="button" onClick={() => handleOpenModal()}>
                <Plus size={20} />
                Nueva Recolección
              </Button>
            </>
          ) : (
            <p className="text-sm text-gray-500 self-center">Solo lectura · registro de producción solo para admin u operario.</p>
          )}
        </div>
      </div>
      {canLogProduction() ? (
        <p className="text-xs text-gray-500 -mt-4">
          <button
            type="button"
            className="underline hover:text-gray-700"
            onClick={openFeedLogModal}
          >
            Registro diario avanzado (opcional)
          </button>
        </p>
      ) : null}

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
          {monthlyFeedSuccess ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="flex items-start justify-between gap-3">
                <p>{monthlyFeedSuccess}</p>
                <button
                  type="button"
                  className="shrink-0 text-emerald-700 underline"
                  onClick={() => setMonthlyFeedSuccess('')}
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : null}

          {feedLogSuccess ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="flex items-start justify-between gap-3">
                <p>{feedLogSuccess}</p>
                <button
                  type="button"
                  className="shrink-0 text-emerald-700 underline"
                  onClick={() => setFeedLogSuccess('')}
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : null}

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

          <Card padding="md">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Consumo (g/ave/día)</p>
                  {feedSnapshot?.lastClosedMonth ? (
                    <>
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {feedSnapshot.lastClosedMonth.gramsPerHenDay.toFixed(1)}
                        <span className="ml-1 text-base font-medium text-gray-500">g</span>
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {MONTH_LABELS[feedSnapshot.lastClosedMonth.month - 1]}{' '}
                        {feedSnapshot.lastClosedMonth.year}
                        {' · '}
                        {feedSnapshot.lastClosedMonth.kgConsumed.toFixed(0)} kg declarados
                        {' · '}
                        {feedSnapshot.lastClosedMonth.hens} aves
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-gray-400">—</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Sin declaración en meses cerrados
                      </p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Stock alimento</p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">
                    {feedSnapshot != null ? feedSnapshot.stockKg.toFixed(1) : '—'}
                    {feedSnapshot != null ? (
                      <span className="ml-1 text-base font-medium text-gray-500">kg</span>
                    ) : null}
                  </p>
                  {feedSnapshot != null ? (
                    <p className="mt-1 text-xs text-gray-500 tabular-nums">
                      {feedSnapshot.baseline
                        ? `Base ${feedSnapshot.baseline.stockKg.toFixed(1)} + compras ${feedSnapshot.purchasedKg.toFixed(1)} − consumo ${feedSnapshot.consumedKg.toFixed(1)}`
                        : `Compras ${feedSnapshot.purchasedKg.toFixed(1)} − Consumo ${feedSnapshot.consumedKg.toFixed(1)}`}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Alcance estimado</p>
                  {feedSnapshot?.daysRemaining == null ? (
                    <p className="text-2xl font-bold text-gray-400">
                      {feedSnapshot?.activeHens === 0 ? 'Sin aves' : '—'}
                    </p>
                  ) : (
                    (() => {
                      const { daysLabel, untilLabel } = formatFeedReachFromToday(
                        feedSnapshot.daysRemaining,
                        feedSnapshot.untilDateYmd
                      );
                      return (
                        <>
                          <p className="text-2xl font-bold text-gray-900 tabular-nums">
                            ~{daysLabel}
                            <span className="ml-1 text-base font-medium text-gray-500">días</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Hasta el {untilLabel} aprox.
                            {feedSnapshot.gramsPerHenDay > 0
                              ? ` · base ${feedSnapshot.gramsPerHenDay.toFixed(0)} g/ave/día${
                                  feedSnapshot.gramsSource === 'default'
                                    ? ' (referencia)'
                                    : ''
                                }`
                              : ''}
                          </p>
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
              {canLogProduction() && (
                <div className="shrink-0 sm:pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setMonthlyFeedSuccess('');
                      setMonthlyFeedFocus(null);
                      setIsMonthlyFeedModalOpen(true);
                    }}
                  >
                    Declarar consumo del mes
                  </Button>
                </div>
              )}
            </div>
          </Card>

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
                  key: 'broken_dirty_eggs_count',
                  label: 'Huevos Rotos/Sucios',
                  render: (value: unknown) => {
                    if (value == null || !Number.isFinite(Number(value))) return '—';
                    const n = Math.floor(Number(value));
                    return n > 0 ? String(n) : '—';
                  },
                },
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
            value={numberInputValue(formData.eggs_count)}
            onChange={(e) => setFormData({ ...formData, eggs_count: parseFormInt(e.target.value, 0) })}
            required
            disabled={clasificarPorTamano}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="clasificar"
              checked={clasificarPorTamano}
              onChange={(e) => {
                const checked = e.target.checked;
                setClasificarPorTamano(checked);
                if (!checked) {
                  setFormData((prev) => ({
                    ...prev,
                    eggs_large: 0,
                    eggs_medium: 0,
                    eggs_small: 0,
                  }));
                }
              }}
            />
            <label htmlFor="clasificar" className="text-sm text-gray-700">
              Clasificar por tamaño
            </label>
          </div>

          {clasificarPorTamano && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
              <Input
                label="Grandes"
                type="number"
                value={numberInputValue(formData.eggs_large || 0)}
                onChange={(e) => {
                  const large = parseInt(e.target.value) || 0;
                  setFormData((prev) => ({
                    ...prev,
                    eggs_large: large,
                    eggs_count: large + (prev.eggs_medium || 0) + (prev.eggs_small || 0),
                  }));
                }}
              />
              <Input
                label="Medianos"
                type="number"
                value={numberInputValue(formData.eggs_medium || 0)}
                onChange={(e) => {
                  const medium = parseInt(e.target.value) || 0;
                  setFormData((prev) => ({
                    ...prev,
                    eggs_medium: medium,
                    eggs_count: (prev.eggs_large || 0) + medium + (prev.eggs_small || 0),
                  }));
                }}
              />
              <Input
                label="Chicos"
                type="number"
                value={numberInputValue(formData.eggs_small || 0)}
                onChange={(e) => {
                  const small = parseInt(e.target.value) || 0;
                  setFormData((prev) => ({
                    ...prev,
                    eggs_small: small,
                    eggs_count: (prev.eggs_large || 0) + (prev.eggs_medium || 0) + small,
                  }));
                }}
              />
              <p className="col-span-3 text-xs text-gray-500">
                Total: {(formData.eggs_large || 0) + (formData.eggs_medium || 0) + (formData.eggs_small || 0)}{' '}
                huevos
              </p>
            </div>
          )}

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
            value={numberInputValue(formData.broken_dirty_eggs_count)}
            onChange={(e) =>
              setFormData({
                ...formData,
                broken_dirty_eggs_count: parseFormInt(e.target.value, 0),
              })
            }
            min="0"
            placeholder="0 (opcional)"
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

      <Modal isOpen={isFeedLogModalOpen} onClose={handleCloseFeedLogModal} title="Registro diario avanzado">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Uso opcional: apertura diaria de alimento. Para el stock y los días restantes usá
            “Declarar consumo del mes”.
          </p>
          <Select
            label="Gallinero"
            options={feedGallineroSelectOptions}
            value={feedGallineroTarget}
            onChange={(e) => setFeedGallineroTarget(e.target.value)}
            required
          />

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
                value={numberInputValue(feedCantidadBolsas)}
                onChange={(e) => setFeedCantidadBolsas(parseFormInt(e.target.value, 0))}
                required
              />
              <Input
                label="Kg por bolsa"
                type="number"
                step="0.01"
                min="0"
                value={numberInputValue(feedKgPorBolsa)}
                onChange={(e) => setFeedKgPorBolsa(parseFormFloat(e.target.value, 0))}
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
              value={numberInputValue(feedKgGranel)}
              onChange={(e) => setFeedKgGranel(parseFormFloat(e.target.value, 0))}
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
              type="button"
              onClick={() => void handleSaveFeedLog()}
              className="flex-1"
              disabled={feedLogSaving || !isFeedConsumoFormValid}
            >
              {feedLogSaving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={handleCloseFeedLogModal}
              className="flex-1"
              disabled={feedLogSaving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={feedStockWarning}
        onClose={() => setFeedStockWarning(false)}
        title="Alimento insuficiente"
        overlayClassName="z-[60]"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            No hay alimento suficiente en stock. ¿Te olvidaste de cargar la compra?
          </p>
          {feedLogError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {feedLogError}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              onClick={() => {
                setFeedStockWarning(false);
                handleCloseFeedLogModal();
                onNavigate?.('gastos');
              }}
            >
              Cargar compra de alimento
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => void persistFeedLog()}
              disabled={feedLogSaving}
            >
              Guardar de todas formas
            </Button>
          </div>
        </div>
      </Modal>

      {organizationId ? (
        <DeclareMonthlyFeedModal
          isOpen={isMonthlyFeedModalOpen}
          onClose={() => {
            setIsMonthlyFeedModalOpen(false);
            setMonthlyFeedFocus(null);
          }}
          organizationId={organizationId}
          activeHens={gallineros.reduce(
            (sum, g) => sum + Math.max(0, Math.floor(Number(g.current_count) || 0)),
            0
          )}
          initialYear={monthlyFeedFocus?.year}
          initialMonth={monthlyFeedFocus?.month}
          onSaved={async (saved) => {
            await loadFeedSnapshot();
            bumpDashboardMetrics();
            const label = `${MONTH_LABELS[saved.month - 1]} ${saved.year}`;
            setMonthlyFeedSuccess(
              `Consumo de ${label} guardado: ${Number(saved.kg_consumed).toFixed(1)} kg. ` +
                'Stock, g/ave/día y días restantes actualizados en esta pantalla.'
            );
            setFeedLogSuccess('');
          }}
        />
      ) : null}
    </div>
  );
}
