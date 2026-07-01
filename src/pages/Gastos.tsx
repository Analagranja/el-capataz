import React from 'react';
import { Expense, FeedConsumptionMonthly, FeedLog, Gallinero } from '../types';
import { expensesService } from '../services/expenses';
import { feedConsumptionMonthlyService } from '../services/feedConsumptionMonthly';
import { feedLogsService } from '../services/feedLogs';
import { gallinerosService } from '../services/gallineros';
import { useAuth } from '../contexts/AuthContext';
import { useBumpDashboardMetrics } from '../contexts/DashboardMetricsRefreshContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { formatArs } from '../utils/formatCurrency';
import { todayLocalYmd } from '../utils/monthToDateFinance';
import { boundsForYearMonthFilter } from '../utils/statsPeriod';

const LAST_BAG_WEIGHT_KEY = 'gastos_alimento_last_bag_weight_kg';

function formatLocalDate(dateText: string) {
  const [year, month, day] = dateText.split('-');
  if (!year || !month || !day) return dateText;
  return `${day}/${month}/${year}`;
}

function isAlimento(category: string): boolean {
  return category === 'Alimento';
}

const EXPENSE_CATEGORIES = [
  'Alimento',
  'Maples / Packaging',
  'Transporte',
  'Veterinario',
  'Mantenimiento',
  'Otro',
];

const DEFAULT_OTROS_CATEGORY = EXPENSE_CATEGORIES.find((c) => c !== 'Alimento') ?? 'Maples / Packaging';

function getDefaultFormData(category = 'Alimento') {
  return {
    date: todayLocalYmd(),
    category,
    customDescription: '' as string,
    unit: 'kg' as 'kg' | 'bolsas',
    quantity_kg: 0,
    bags_count: 0,
    bag_weight_kg: getSavedBagWeight(),
    bag_price: 0,
    total_price: 0,
    gallinero_id: null as string | null,
  };
}

function expenseCategoryLabel(description: string): string {
  return EXPENSE_CATEGORIES.includes(description) ? description : 'Otro';
}

function expenseDetailLabel(description: string): string {
  return EXPENSE_CATEGORIES.includes(description) ? '—' : description;
}

function consumptionGallineroIdFromFilter(filterGallinero: string): string | null {
  if (filterGallinero === 'all' || filterGallinero === 'general') return null;
  return filterGallinero;
}

function getSavedBagWeight(): number {
  if (typeof window === 'undefined') return 25;
  const raw = window.localStorage.getItem(LAST_BAG_WEIGHT_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

const GASTOS_MONTH_OPTIONS = [
  { value: '', label: 'Todos los meses' },
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
];

export default function Gastos() {
  const { organizationId } = useAuth();
  const bumpDashboardMetrics = useBumpDashboardMetrics();
  const now = React.useMemo(() => new Date(), []);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [activeTab, setActiveTab] = React.useState<'alimento' | 'otros'>('alimento');
  const [filterGallinero, setFilterGallinero] = React.useState<string>('all');
  const [selectedYear, setSelectedYear] = React.useState<string>(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    String(now.getMonth() + 1).padStart(2, '0')
  );
  const [loading, setLoading] = React.useState(true);
  const [feedLogs, setFeedLogs] = React.useState<FeedLog[]>([]);
  const [consumption, setConsumption] = React.useState<FeedConsumptionMonthly | null>(null);
  const [consumptionLoading, setConsumptionLoading] = React.useState(false);
  const [consumptionModalOpen, setConsumptionModalOpen] = React.useState(false);
  const [consumptionForm, setConsumptionForm] = React.useState({
    kg_consumed: '',
    notes: '',
  });
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    date: todayLocalYmd(),
    category: 'Alimento' as string,
    customDescription: '' as string,
    unit: 'kg' as 'kg' | 'bolsas',
    quantity_kg: 0,
    bags_count: 0,
    bag_weight_kg: getSavedBagWeight(),
    bag_price: 0,
    total_price: 0,
    gallinero_id: null as string | null,
  });

  const loadGallineros = async () => {
    if (!organizationId) {
      setGallineros([]);
      return;
    }
    try {
      const data = await gallinerosService.getAll(organizationId);
      setGallineros(data);
    } catch (error) {
      console.error('Error loading gallineros:', error);
      setGallineros([]);
    }
  };

  const yearOptions = React.useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 4 }, (_, i) => {
      const year = String(y - i);
      return { value: year, label: year };
    });
  }, [now]);

  React.useEffect(() => {
    loadGallineros();
  }, [organizationId]);

  React.useEffect(() => {
    if (!organizationId) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { fromYmd, toYmd } = boundsForYearMonthFilter(selectedYear, selectedMonth);
        const [expensesData, feedLogsData] = await Promise.all([
          expensesService.getAllRange(organizationId, fromYmd, toYmd),
          feedLogsService.getAllRange(organizationId, fromYmd, toYmd),
        ]);
        if (!cancelled) {
          setExpenses(expensesData);
          setFeedLogs(feedLogsData);
        }
      } catch (error) {
        console.error('Error loading expenses:', error);
        if (!cancelled) {
          setExpenses([]);
          setFeedLogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedYear, selectedMonth]);

  React.useEffect(() => {
    if (!organizationId || !selectedMonth) {
      setConsumption(null);
      return;
    }
    const year = Number(selectedYear);
    const month = Number(selectedMonth);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      setConsumption(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setConsumptionLoading(true);
        const gallineroId = consumptionGallineroIdFromFilter(filterGallinero);
        const data = await feedConsumptionMonthlyService.getByPeriod(
          organizationId,
          year,
          month,
          gallineroId
        );
        if (!cancelled) setConsumption(data);
      } catch (error) {
        console.error('Error loading feed consumption:', error);
        if (!cancelled) setConsumption(null);
      } finally {
        if (!cancelled) setConsumptionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedYear, selectedMonth, filterGallinero]);

  const reloadExpenses = async () => {
    if (!organizationId) return;
    const { fromYmd, toYmd } = boundsForYearMonthFilter(selectedYear, selectedMonth);
    const [expensesData, feedLogsData] = await Promise.all([
      expensesService.getAllRange(organizationId, fromYmd, toYmd),
      feedLogsService.getAllRange(organizationId, fromYmd, toYmd),
    ]);
    setExpenses(expensesData);
    setFeedLogs(feedLogsData);
  };

  const reloadConsumption = async () => {
    if (!organizationId || !selectedMonth) {
      setConsumption(null);
      return;
    }
    const year = Number(selectedYear);
    const month = Number(selectedMonth);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;
    const gallineroId = consumptionGallineroIdFromFilter(filterGallinero);
    const data = await feedConsumptionMonthlyService.getByPeriod(
      organizationId,
      year,
      month,
      gallineroId
    );
    setConsumption(data);
  };

  const defaultCategoryForTab = (tab: 'alimento' | 'otros') =>
    tab === 'alimento' ? 'Alimento' : DEFAULT_OTROS_CATEGORY;

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(getDefaultFormData(defaultCategoryForTab(activeTab)));
  };

  const openNewExpenseModal = () => {
    setEditingId(null);
    setFormData(getDefaultFormData(defaultCategoryForTab(activeTab)));
    setIsModalOpen(true);
  };

  const handleOpenEdit = (expense: Expense) => {
    const cat = EXPENSE_CATEGORIES.includes(expense.description) ? expense.description : 'Otro';
    const customDesc = cat === 'Otro' ? expense.description : '';
    setEditingId(expense.id);
    setFormData({
      date: expense.date.slice(0, 10),
      category: cat,
      customDescription: customDesc,
      unit: 'kg',
      quantity_kg: expense.quantity_kg,
      bags_count: 0,
      bag_weight_kg: getSavedBagWeight(),
      bag_price: 0,
      total_price: expense.total_price,
      gallinero_id: expense.gallinero_id ?? null,
    });
    setIsModalOpen(true);
  };

  const gallineroFormSelectOptions = React.useMemo(
    () => [
      { value: '', label: 'Granja general' },
      ...gallineros.map((g) => ({ value: g.id, label: g.name })),
    ],
    [gallineros]
  );

  const gallineroFilterOptions = React.useMemo(
    () => [
      { value: 'all', label: 'Todos' },
      { value: 'general', label: 'Granja general' },
      ...gallineros.map((g) => ({ value: g.id, label: g.name })),
    ],
    [gallineros]
  );

  const filteredExpenses = React.useMemo(() => {
    if (filterGallinero === 'all') return expenses;
    if (filterGallinero === 'general') {
      return expenses.filter((e) => e.gallinero_id == null);
    }
    return expenses.filter((e) => e.gallinero_id === filterGallinero);
  }, [expenses, filterGallinero]);

  const openConsumptionModal = () => {
    setConsumptionForm({
      kg_consumed: consumption ? String(consumption.kg_consumed) : '',
      notes: consumption?.notes ?? '',
    });
    setConsumptionModalOpen(true);
  };

  const handleCloseConsumptionModal = () => {
    setConsumptionModalOpen(false);
    setConsumptionForm({ kg_consumed: '', notes: '' });
  };

  const handleSaveConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !selectedMonth) return;
    const year = Number(selectedYear);
    const month = Number(selectedMonth);
    const kg = parseFloat(consumptionForm.kg_consumed);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(kg) || kg < 0) return;
    try {
      const gallineroId = consumptionGallineroIdFromFilter(filterGallinero);
      await feedConsumptionMonthlyService.upsert(
        organizationId,
        year,
        month,
        kg,
        consumptionForm.notes,
        gallineroId
      );
      await reloadConsumption();
      handleCloseConsumptionModal();
    } catch (error) {
      console.error('Error saving feed consumption:', error);
    }
  };

  const handleDeleteConsumption = async () => {
    if (!organizationId || !consumption) return;
    if (!window.confirm('¿Eliminar el consumo declarado de este mes?')) return;
    try {
      await feedConsumptionMonthlyService.delete(organizationId, consumption.id);
      setConsumption(null);
    } catch (error) {
      console.error('Error deleting feed consumption:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    const alimento = isAlimento(formData.category);
    const description =
      formData.category === 'Otro' ? formData.customDescription : formData.category;

    let quantityKg = 0;
    let computedTotalPrice = formData.total_price;

    if (alimento) {
      quantityKg =
        formData.unit === 'bolsas'
          ? (formData.bags_count || 0) * (formData.bag_weight_kg || 0)
          : formData.quantity_kg;
      if (quantityKg <= 0) return;
      computedTotalPrice =
        formData.unit === 'bolsas'
          ? (formData.bags_count || 0) * (formData.bag_price || 0)
          : formData.total_price;
    } else if (computedTotalPrice <= 0) {
      return;
    }

    try {
      if (editingId) {
        await expensesService.update(
          organizationId,
          editingId,
          formData.date,
          description,
          quantityKg,
          computedTotalPrice,
          formData.gallinero_id ?? null
        );
      } else {
        await expensesService.create(
          organizationId,
          formData.date,
          description,
          quantityKg,
          computedTotalPrice,
          formData.gallinero_id ?? null
        );
      }
      if (alimento && formData.unit === 'bolsas' && formData.bag_weight_kg > 0 && typeof window !== 'undefined') {
        window.localStorage.setItem(LAST_BAG_WEIGHT_KEY, String(formData.bag_weight_kg));
      }
      await reloadExpenses();
      bumpDashboardMetrics();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!organizationId) return;
    if (window.confirm('¿Eliminar este gasto?')) {
      try {
        await expensesService.delete(organizationId, id);
        await reloadExpenses();
        bumpDashboardMetrics();
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    }
  };

  const filteredFeedLogs = React.useMemo(() => {
    if (filterGallinero === 'all') return feedLogs;
    if (filterGallinero === 'general') return [];
    return feedLogs.filter((log) => log.gallinero_id === filterGallinero);
  }, [feedLogs, filterGallinero]);

  const totalBolsasCompradas = React.useMemo(() => {
    const bolsasLogs = filteredFeedLogs.filter(
      (log) => log.tipo === 'bolsas' && log.cantidad_bolsas != null
    );
    if (bolsasLogs.length === 0) return null;
    return bolsasLogs.reduce((sum, log) => sum + (log.cantidad_bolsas ?? 0), 0);
  }, [filteredFeedLogs]);

  const selectedMonthLabel = React.useMemo(
    () => GASTOS_MONTH_OPTIONS.find((o) => o.value === selectedMonth)?.label ?? selectedMonth,
    [selectedMonth]
  );

  const consumptionGallineroLabel = React.useMemo(() => {
    if (filterGallinero === 'all' || filterGallinero === 'general') return 'Toda la granja';
    return gallineros.find((g) => g.id === filterGallinero)?.name ?? 'Gallinero';
  }, [filterGallinero, gallineros]);

  const poultryCountForConsumption = React.useMemo(() => {
    if (filterGallinero !== 'all' && filterGallinero !== 'general') {
      const g = gallineros.find((item) => item.id === filterGallinero);
      return g?.current_count ?? 0;
    }
    return gallineros.reduce((sum, g) => sum + (g.current_count ?? 0), 0);
  }, [filterGallinero, gallineros]);

  const gramsPerHenPerDay = React.useMemo(() => {
    if (!consumption || poultryCountForConsumption <= 0) return null;
    const year = Number(selectedYear);
    const month = Number(selectedMonth);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (daysInMonth <= 0) return null;
    return (consumption.kg_consumed * 1000) / (daysInMonth * poultryCountForConsumption);
  }, [consumption, poultryCountForConsumption, selectedYear, selectedMonth]);

  const alimentoExpenses = React.useMemo(
    () => filteredExpenses.filter((e) => e.description === 'Alimento'),
    [filteredExpenses]
  );

  const otrosExpenses = React.useMemo(
    () => filteredExpenses.filter((e) => e.description !== 'Alimento'),
    [filteredExpenses]
  );

  const totalAlimentoInvertido = alimentoExpenses.reduce((sum, e) => sum + e.total_price, 0);
  const totalAlimentoKg = alimentoExpenses.reduce((sum, e) => sum + e.quantity_kg, 0);
  const totalOtrosGastos = otrosExpenses.reduce((sum, e) => sum + e.total_price, 0);

  const renderExpenseActions = (row: Expense) => (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        title="Editar gasto"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sky-700 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1"
        onClick={() => handleOpenEdit(row)}
      >
        <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="sr-only">Editar</span>
      </button>
      <Button variant="danger" size="sm" type="button" title="Eliminar gasto" onClick={() => handleDelete(row.id)}>
        <Trash2 size={16} aria-hidden />
      </Button>
    </div>
  );

  const isAlimentoForm = isAlimento(formData.category);
  const kilosFromBags = (formData.bags_count || 0) * (formData.bag_weight_kg || 0);
  const totalFromBagsPrice = (formData.bags_count || 0) * (formData.bag_price || 0);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-gray-900">Gastos</h2>
        <Button variant="primary" onClick={openNewExpenseModal}>
          <Plus size={20} />
          {activeTab === 'alimento' ? 'Nuevo gasto de alimento' : 'Nuevo otro gasto'}
        </Button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'alimento'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('alimento')}
        >
          Alimento
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'otros'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('otros')}
        >
          Otros gastos
        </button>
      </div>

      {activeTab === 'alimento' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card padding="md" hover>
            <p className="text-sm text-gray-600 mb-1">Total Comprado (kg)</p>
            <p className="text-2xl font-bold text-gray-900">{totalAlimentoKg.toFixed(2)}</p>
          </Card>
          <Card padding="md" hover>
            <p className="text-sm text-gray-600 mb-1">Total bolsas compradas</p>
            <p className="text-2xl font-bold text-gray-900">
              {totalBolsasCompradas != null ? totalBolsasCompradas : '—'}
            </p>
          </Card>
          <Card padding="md" hover>
            <p className="text-sm text-gray-600 mb-1">Total invertido en alimento ($)</p>
            <p className="text-2xl font-bold text-gray-900">{formatArs(totalAlimentoInvertido)}</p>
          </Card>
          <Card padding="md" hover>
            <p className="text-sm text-gray-600 mb-1">Costo Promedio por kg</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatArs(totalAlimentoKg > 0 ? totalAlimentoInvertido / totalAlimentoKg : 0)}
            </p>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card padding="md" hover>
            <p className="text-sm text-gray-600 mb-1">Total otros gastos ($)</p>
            <p className="text-2xl font-bold text-gray-900">{formatArs(totalOtrosGastos)}</p>
          </Card>
          <Card padding="md" hover>
            <p className="text-sm text-gray-600 mb-1">Cantidad de registros</p>
            <p className="text-2xl font-bold text-gray-900">{otrosExpenses.length}</p>
          </Card>
        </div>
      )}

      <Card padding="md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Select
            label="Año"
            options={yearOptions}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          />
          <Select
            label="Mes"
            options={GASTOS_MONTH_OPTIONS}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>
        <Select
          label="Filtrar por gallinero"
          options={gallineroFilterOptions}
          value={filterGallinero}
          onChange={(e) => setFilterGallinero(e.target.value)}
        />
      </Card>

      {activeTab === 'alimento' && (
        <Card padding="md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Consumo de alimento del período</h3>
          {selectedMonth === '' ? (
            <p className="text-gray-600">Seleccioná un mes para ver el consumo declarado</p>
          ) : consumptionLoading ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : consumption ? (
            <div className="space-y-3">
              <p className="text-gray-900">
                Kg consumidos declarados: <strong>{consumption.kg_consumed.toFixed(2)} kg</strong>
              </p>
              <p className="text-gray-900">
                Gramos por ave por día:{' '}
                <strong>
                  {gramsPerHenPerDay != null ? `${gramsPerHenPerDay.toFixed(1)} g` : 'Sin datos'}
                </strong>
              </p>
              {consumption.notes?.trim() ? (
                <p className="text-sm text-gray-500">{consumption.notes}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="secondary" size="sm" type="button" onClick={openConsumptionModal}>
                  Editar
                </Button>
                <Button variant="danger" size="sm" type="button" onClick={handleDeleteConsumption}>
                  Eliminar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-600">No hay consumo declarado para este mes</p>
              <Button variant="primary" size="sm" type="button" onClick={openConsumptionModal}>
                Declarar consumo
              </Button>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'alimento' ? (
        <Card padding="none">
          <Table
            columns={[
              {
                key: 'date',
                label: 'Fecha',
                render: (value) => formatLocalDate(String(value)),
              },
              {
                key: 'quantity_kg',
                label: 'Cantidad (kg)',
                render: (value) => `${Number(value).toFixed(2)} kg`,
              },
              {
                key: 'total_price',
                label: 'Total',
                render: (value) => formatArs(value as number),
              },
              {
                key: 'gallinero_name',
                label: 'Gallinero',
                render: (_value, row: Expense) =>
                  row.gallinero_id == null ? 'General' : row.gallinero_name?.trim() || 'General',
              },
              {
                key: 'id',
                label: 'Acciones',
                render: (_value, row: Expense) => renderExpenseActions(row),
              },
            ]}
            data={alimentoExpenses}
          />
        </Card>
      ) : (
        <Card padding="none">
          <Table
            columns={[
              {
                key: 'date',
                label: 'Fecha',
                render: (value) => formatLocalDate(String(value)),
              },
              {
                key: 'category',
                label: 'Categoría',
                render: (_value, row: Expense) => expenseCategoryLabel(row.description),
              },
              {
                key: 'detail',
                label: 'Descripción',
                render: (_value, row: Expense) => expenseDetailLabel(row.description),
              },
              {
                key: 'total_price',
                label: 'Total',
                render: (value) => formatArs(value as number),
              },
              {
                key: 'gallinero_name',
                label: 'Gallinero',
                render: (_value, row: Expense) =>
                  row.gallinero_id == null ? 'General' : row.gallinero_name?.trim() || 'General',
              },
              {
                key: 'id',
                label: 'Acciones',
                render: (_value, row: Expense) => renderExpenseActions(row),
              },
            ]}
            data={otrosExpenses}
          />
        </Card>
      )}

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingId ? 'Editar Gasto' : 'Nuevo Gasto'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Fecha"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          <Select
            label="Categoría"
            options={EXPENSE_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            required
          />

          {formData.category === 'Otro' && (
            <Input
              label="Descripción"
              value={formData.customDescription}
              onChange={(e) => setFormData({ ...formData, customDescription: e.target.value })}
              placeholder="Describí el gasto"
              required
            />
          )}

          <Select
            label="Asignar a gallinero (opcional)"
            options={gallineroFormSelectOptions}
            value={formData.gallinero_id ?? ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                gallinero_id: e.target.value === '' ? null : e.target.value,
              })
            }
          />

          {isAlimentoForm && (
            <Select
              label="Unidad"
              options={[
                { value: 'kg', label: 'Kg' },
                { value: 'bolsas', label: 'Bolsas' },
              ]}
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value as 'kg' | 'bolsas' })}
            />
          )}

          {isAlimentoForm && formData.unit === 'bolsas' ? (
            <>
              <Input
                label="Cantidad de bolsas"
                type="number"
                step="1"
                min="0"
                value={formData.bags_count}
                onChange={(e) => setFormData({ ...formData, bags_count: parseFloat(e.target.value) || 0 })}
                required
              />
              <Input
                label="Precio por bolsa"
                type="number"
                step="0.01"
                min="0"
                value={formData.bag_price}
                onChange={(e) => setFormData({ ...formData, bag_price: parseFloat(e.target.value) || 0 })}
                required
              />
              <Input
                label="Peso por bolsa (kg)"
                type="number"
                step="0.01"
                min="0"
                value={formData.bag_weight_kg}
                onChange={(e) => setFormData({ ...formData, bag_weight_kg: parseFloat(e.target.value) || 0 })}
                helperText="Este valor recuerda el último peso ingresado."
                required
              />
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                Kilos totales calculados automáticamente: <strong>{kilosFromBags.toFixed(2)} kg</strong>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                Total calculado automáticamente: <strong>{formatArs(totalFromBagsPrice)}</strong>
              </div>
            </>
          ) : isAlimentoForm ? (
            <Input
              label="Cantidad (kg)"
              type="number"
              step="0.01"
              min="0"
              value={formData.quantity_kg}
              onChange={(e) => setFormData({ ...formData, quantity_kg: parseFloat(e.target.value) || 0 })}
              required
            />
          ) : null}

          {isAlimentoForm && formData.unit === 'bolsas' ? (
            <Input
              label="Total"
              type="number"
              step="0.01"
              value={Number.isFinite(totalFromBagsPrice) ? totalFromBagsPrice : 0}
              onChange={() => {}}
              helperText="Se calcula como Cantidad de bolsas × Precio por bolsa."
              required
              disabled
            />
          ) : (
            <Input
              label="Total"
              type="number"
              step="0.01"
              value={formData.total_price}
              onChange={(e) => setFormData({ ...formData, total_price: parseFloat(e.target.value) || 0 })}
              required
            />
          )}

          <div className="flex gap-2 pt-4">
            <Button variant="primary" type="submit" className="flex-1">
              {editingId ? 'Guardar cambios' : 'Guardar'}
            </Button>
            <Button variant="secondary" type="button" onClick={handleCloseModal} className="flex-1">
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={consumptionModalOpen}
        onClose={handleCloseConsumptionModal}
        title={consumption ? 'Editar consumo' : 'Declarar consumo'}
      >
        <form onSubmit={handleSaveConsumption} className="space-y-4">
          <p className="text-sm text-gray-600">
            Mes seleccionado: <strong>{selectedMonthLabel}</strong> {selectedYear}
          </p>
          <p className="text-sm text-gray-600">
            Gallinero: <strong>{consumptionGallineroLabel}</strong>
          </p>
          <Input
            label="Kg consumidos en el mes"
            type="number"
            step="0.01"
            min="0"
            value={consumptionForm.kg_consumed}
            onChange={(e) => setConsumptionForm({ ...consumptionForm, kg_consumed: e.target.value })}
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[72px]"
              value={consumptionForm.notes}
              onChange={(e) => setConsumptionForm({ ...consumptionForm, notes: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <div className="flex gap-2 pt-4">
            <Button variant="primary" type="submit" className="flex-1">
              Guardar
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={handleCloseConsumptionModal}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
