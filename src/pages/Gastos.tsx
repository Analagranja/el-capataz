import React from 'react';
import { Expense, Gallinero } from '../types';
import { expensesService } from '../services/expenses';
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

function isAlimento(description: string): boolean {
  return description.trim().toLowerCase().includes('alimento');
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
  const [filterGallinero, setFilterGallinero] = React.useState<string>('all');
  const [selectedYear, setSelectedYear] = React.useState<string>(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    String(now.getMonth() + 1).padStart(2, '0')
  );
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    date: todayLocalYmd(),
    description: 'Alimento',
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
        const data = await expensesService.getAllRange(organizationId, fromYmd, toYmd);
        if (!cancelled) setExpenses(data);
      } catch (error) {
        console.error('Error loading expenses:', error);
        if (!cancelled) setExpenses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedYear, selectedMonth]);

  const reloadExpenses = async () => {
    if (!organizationId) return;
    const { fromYmd, toYmd } = boundsForYearMonthFilter(selectedYear, selectedMonth);
    const data = await expensesService.getAllRange(organizationId, fromYmd, toYmd);
    setExpenses(data);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({
      date: todayLocalYmd(),
      description: 'Alimento',
      unit: 'kg',
      quantity_kg: 0,
      bags_count: 0,
      bag_weight_kg: getSavedBagWeight(),
      bag_price: 0,
      total_price: 0,
      gallinero_id: null,
    });
  };

  const openNewExpenseModal = () => {
    setEditingId(null);
    setFormData({
      date: todayLocalYmd(),
      description: 'Alimento',
      unit: 'kg',
      quantity_kg: 0,
      bags_count: 0,
      bag_weight_kg: getSavedBagWeight(),
      bag_price: 0,
      total_price: 0,
      gallinero_id: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setFormData({
      date: expense.date.slice(0, 10),
      description: expense.description,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    const alimento = isAlimento(formData.description);
    const quantityKg =
      alimento && formData.unit === 'bolsas'
        ? (formData.bags_count || 0) * (formData.bag_weight_kg || 0)
        : formData.quantity_kg;

    if (quantityKg <= 0) return;

    const computedTotalPrice =
      alimento && formData.unit === 'bolsas'
        ? (formData.bags_count || 0) * (formData.bag_price || 0)
        : formData.total_price;

    try {
      if (editingId) {
        await expensesService.update(
          organizationId,
          editingId,
          formData.date,
          formData.description,
          quantityKg,
          computedTotalPrice,
          formData.gallinero_id ?? null
        );
      } else {
        await expensesService.create(
          organizationId,
          formData.date,
          formData.description,
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

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.total_price, 0);
  const totalKg = filteredExpenses.reduce((sum, e) => sum + e.quantity_kg, 0);
  const isAlimentoForm = isAlimento(formData.description);
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
          Nuevo Gasto
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card padding="md" hover>
          <p className="text-sm text-gray-600 mb-1">Total Comprado (kg)</p>
          <p className="text-2xl font-bold text-gray-900">{totalKg.toFixed(2)}</p>
        </Card>
        <Card padding="md" hover>
          <p className="text-sm text-gray-600 mb-1">Total invertido (período)</p>
          <p className="text-2xl font-bold text-gray-900">{formatArs(totalExpenses)}</p>
        </Card>
        <Card padding="md" hover>
          <p className="text-sm text-gray-600 mb-1">Costo Promedio por kg</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatArs(totalKg > 0 ? totalExpenses / totalKg : 0)}
          </p>
        </Card>
      </div>

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

      <Card padding="none">
        <Table
          columns={[
            {
              key: 'date',
              label: 'Fecha',
              render: (value) => formatLocalDate(String(value)),
            },
            { key: 'description', label: 'Descripción' },
            {
              key: 'quantity_kg',
              label: 'Cantidad (kg)',
              render: (value) => `${value.toFixed(2)} kg`,
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
              render: (_value, row: Expense) => (
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
              ),
            },
          ]}
          data={filteredExpenses}
        />
      </Card>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingId ? 'Editar Gasto' : 'Nuevo Gasto'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Fecha"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          <Input
            label="Descripción"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Ej: Alimento"
            required
          />

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
          ) : (
            <Input
              label="Cantidad (kg)"
              type="number"
              step="0.01"
              min="0"
              value={formData.quantity_kg}
              onChange={(e) => setFormData({ ...formData, quantity_kg: parseFloat(e.target.value) || 0 })}
              required
            />
          )}

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
    </div>
  );
}
