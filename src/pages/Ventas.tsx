import React from 'react';
import { Customer, Page, Sale } from '../types';
import { salesService } from '../services/sales';
import { customersService } from '../services/customers';
import { useAuth } from '../contexts/AuthContext';
import {
  availableEggStockForSale,
  availableMapleStockForSale,
  eggImpactForSale,
  EGG_STOCK_LABELS,
  inventoryStockService,
  MAPLE_STOCK_LABELS,
} from '../services/inventoryStock';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Check, FileSpreadsheet } from 'lucide-react';
import { formatArs } from '../utils/formatCurrency';
import { downloadSalesExcel } from '../utils/exportSalesOnly';
import { todayLocalYmdParts } from '../utils/statsPeriod';
import {
  numberInputValue,
  parseFormFloat,
  parseFormInt,
  safeFormNumber,
} from '../utils/formNumbers';
import {
  UNASSIGNED_CUSTOMER_LABEL,
  groupUnpaidSalesByCustomer,
  unpaidGrandTotal,
} from '../utils/unpaidSales';

const SALE_TYPE_OPTIONS: Array<{ value: Sale['type']; label: string }> = [
  { value: 'maple', label: 'Maple (30 huevos)' },
  { value: 'docena', label: 'Docena (12 huevos)' },
  { value: 'media_docena', label: 'Media Docena (6 huevos)' },
  { value: 'pack15', label: 'Pack x15 huevos' },
  { value: 'maple_grande', label: 'Maple Grande x30' },
  { value: 'maple_mediano', label: 'Maple Mediano x30' },
  { value: 'maple_chico', label: 'Maple Chico x30' },
];

const MONTH_NAMES = [
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

const VENTAS_MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label,
}));

export default function Ventas({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const { organizationId } = useAuth();
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [selectedYear, setSelectedYear] = React.useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    String(new Date().getMonth() + 1).padStart(2, '0')
  );
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<'ventas' | 'cuenta'>('ventas');
  const [unpaidSales, setUnpaidSales] = React.useState<Sale[]>([]);
  const [unpaidLoading, setUnpaidLoading] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
  const [markingPaidId, setMarkingPaidId] = React.useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isQuickCustomerFormOpen, setIsQuickCustomerFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>('');
  const [eggStockWarning, setEggStockWarning] = React.useState<{ sizeLabel: string } | null>(null);
  const [mapleToast, setMapleToast] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formData, setFormData] = React.useState({
    date: todayLocalYmdParts().ymd,
    customer_id: '',
    type: 'docena' as Sale['type'],
    quantity: 0,
    price_per_unit: 0,
    notes: '',
    is_paid: true,
  });
  const [newCustomerData, setNewCustomerData] = React.useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });

  const loadCustomers = async () => {
    if (!organizationId) return;
    try {
      const data = await customersService.getAll(organizationId);
      setCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const loadSales = async () => {
    if (!organizationId) return;
    try {
      const fromDate = `${selectedYear}-${selectedMonth}-01`;
      const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate();
      const toDate = `${selectedYear}-${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      const data = await salesService.getAllRange(organizationId, fromDate, toDate);
      setSales(data);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnpaid = async () => {
    if (!organizationId) return;
    try {
      setUnpaidLoading(true);
      const data = await salesService.getUnpaid(organizationId);
      setUnpaidSales(data);
    } catch (error) {
      console.error('Error loading unpaid sales:', error);
    } finally {
      setUnpaidLoading(false);
    }
  };

  React.useEffect(() => {
    loadSales();
  }, [organizationId, selectedYear, selectedMonth]);

  React.useEffect(() => {
    loadCustomers();
  }, [organizationId]);

  React.useEffect(() => {
    if (activeTab === 'cuenta') {
      loadUnpaid();
    }
  }, [organizationId, activeTab]);

  const handleOpenModal = (sale?: Sale) => {
    if (sale) {
      setEditingId(sale.id);
      setFormData({
        date: String(sale.date || '').slice(0, 10) || todayLocalYmdParts().ymd,
        customer_id: sale.customer_id || '',
        type: sale.type,
        quantity: safeFormNumber(sale.quantity, 0),
        price_per_unit: safeFormNumber(sale.price_per_unit, 0),
        notes: sale.notes || '',
        is_paid: sale.is_paid !== false,
      });
    } else {
      setEditingId(null);
      setFormData({
        date: todayLocalYmdParts().ymd,
        customer_id: customers[0]?.id || '',
        type: 'docena',
        quantity: 0,
        price_per_unit: 0,
        notes: '',
        is_paid: true,
      });
    }
    setIsQuickCustomerFormOpen(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setIsQuickCustomerFormOpen(false);
    setError('');
    setEggStockWarning(null);
  };

  const handleQuickCreateCustomer = async () => {
    if (!organizationId || !newCustomerData.name.trim()) return;
    try {
      const created = await customersService.create(
        organizationId,
        newCustomerData.name.trim(),
        newCustomerData.phone.trim(),
        newCustomerData.address.trim(),
        newCustomerData.notes.trim()
      );
      setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData((prev) => ({ ...prev, customer_id: created.id }));
      setNewCustomerData({ name: '', phone: '', address: '', notes: '' });
      setIsQuickCustomerFormOpen(false);
    } catch (error) {
      console.error('Error creating customer:', error);
    }
  };

  const persistSale = async () => {
    if (!organizationId) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await salesService.update(
          organizationId,
          editingId,
          formData.date,
          formData.customer_id,
          formData.type,
          formData.quantity,
          formData.price_per_unit,
          formData.notes,
          formData.is_paid
        );
      } else {
        await salesService.create(
          organizationId,
          formData.date,
          formData.customer_id,
          formData.type,
          formData.quantity,
          formData.price_per_unit,
          formData.notes,
          formData.is_paid
        );
      }
      loadSales();
      if (activeTab === 'cuenta' || !formData.is_paid) {
        loadUnpaid();
      }
      handleCloseModal();
    } catch (err: any) {
      console.error('Error saving sale:', err);
      const msg =
        (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' ? err.message : '') ||
        'No se pudo guardar la venta.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!organizationId) return;

    const editingSale = editingId ? sales.find((s) => s.id === editingId) ?? null : null;

    try {
      // Validaciones aditivas (no cambian el guardado): huevos modal + maples toast.
      const [eggInv, mapleInv] = await Promise.all([
        inventoryStockService.loadEggInventory(organizationId),
        inventoryStockService.loadMapleInventory(organizationId),
      ]);

      const eggImpact = eggImpactForSale(formData.type, formData.quantity);
      const eggAvailable = availableEggStockForSale(
        eggInv.bySize,
        formData.type,
        formData.quantity,
        editingSale
      );
      if (eggImpact.eggs > 0 && eggAvailable < eggImpact.eggs) {
        setEggStockWarning({ sizeLabel: EGG_STOCK_LABELS[eggImpact.key] });
        return;
      }

      const mapleCheck = availableMapleStockForSale(
        mapleInv.byItem,
        formData.type,
        formData.quantity,
        editingSale
      );
      if (mapleCheck && mapleCheck.needed > 0 && mapleCheck.available < mapleCheck.needed) {
        setMapleToast(
          `Atención: no queda stock suficiente de ${MAPLE_STOCK_LABELS[mapleCheck.key]} registrado. Recordá reponer packaging.`
        );
      }

      await persistSale();
    } catch (err) {
      console.error('Error checking inventory before sale:', err);
      // Si falla el chequeo, no bloquear: guardar igual (flujo productivo).
      await persistSale();
    }
  };

  const handleEggWarningContinue = async () => {
    setEggStockWarning(null);
    if (!organizationId) return;
    try {
      const mapleInv = await inventoryStockService.loadMapleInventory(organizationId);
      const editingSale = editingId ? sales.find((s) => s.id === editingId) ?? null : null;
      const mapleCheck = availableMapleStockForSale(
        mapleInv.byItem,
        formData.type,
        formData.quantity,
        editingSale
      );
      if (mapleCheck && mapleCheck.needed > 0 && mapleCheck.available < mapleCheck.needed) {
        setMapleToast(
          `Atención: no queda stock suficiente de ${MAPLE_STOCK_LABELS[mapleCheck.key]} registrado. Recordá reponer packaging.`
        );
      }
    } catch {
      /* ignore */
    }
    await persistSale();
  };

  const handleDelete = async (id: string) => {
    if (!organizationId) return;
    if (window.confirm('¿Está seguro?')) {
      try {
        await salesService.delete(organizationId, id);
        loadSales();
        if (activeTab === 'cuenta') {
          loadUnpaid();
        }
      } catch (error) {
        console.error('Error deleting sale:', error);
      }
    }
  };

  const typeLabels: Record<Sale['type'], string> = {
    maple: 'Maple (30)',
    docena: 'Docena (12)',
    media_docena: 'Media Docena (6)',
    pack15: 'Pack x15',
    maple_grande: 'Maple Grande (30)',
    maple_mediano: 'Maple Mediano (30)',
    maple_chico: 'Maple Chico (30)',
  };
  const eggsPerSaleType: Record<Sale['type'], number> = {
    maple: 30,
    docena: 12,
    media_docena: 6,
    pack15: 15,
    maple_grande: 30,
    maple_mediano: 30,
    maple_chico: 30,
  };

  const handleMarkPaid = async (saleId: string) => {
    if (!organizationId) return;
    if (!window.confirm('¿Marcar esta venta como pagada?')) return;
    setMarkingPaidId(saleId);
    try {
      await salesService.setPaid(organizationId, saleId, true);
      setUnpaidSales((prev) => prev.filter((s) => s.id !== saleId));
      setSales((prev) => prev.map((s) => (s.id === saleId ? { ...s, is_paid: true } : s)));
    } catch (error) {
      console.error('Error marking sale as paid:', error);
    } finally {
      setMarkingPaidId(null);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const unpaidGroups = React.useMemo(
    () => groupUnpaidSalesByCustomer(unpaidSales),
    [unpaidSales]
  );
  const unpaidTotal = unpaidGrandTotal(unpaidGroups);

  const totalSales = sales.reduce((sum, s) => sum + s.total_price, 0);
  const totalEggsSold = sales.reduce(
    (sum, sale) => sum + sale.quantity * (eggsPerSaleType[sale.type] || 0),
    0
  );
  const avgPricePerEgg = totalEggsSold > 0 ? totalSales / totalEggsSold : 0;
  const periodLabel = `${MONTH_NAMES[Number(selectedMonth) - 1]} ${selectedYear}`;

  const yearOptions = React.useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const y = String(new Date().getFullYear() - i);
        return { value: y, label: y };
      }),
    []
  );

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-gray-900">Ventas</h2>
        <Button variant="primary" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          Nueva Venta
        </Button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'ventas'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('ventas')}
        >
          Ventas
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'cuenta'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('cuenta')}
        >
          Cuenta corriente
        </button>
      </div>

      {activeTab === 'cuenta' ? (
        <>
          <Card padding="md" hover>
            <div>
              <p className="text-sm text-gray-600 mb-1">Pendientes de cobro</p>
              <p className="text-2xl font-bold text-gray-900">{formatArs(unpaidTotal)}</p>
            </div>
          </Card>

          {unpaidLoading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : unpaidGroups.length === 0 ? (
            <Card padding="md">
              <p className="text-sm text-gray-500 text-center py-6">
                No hay ventas pendientes de cobro.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {unpaidGroups.map((group) => {
                const expanded = !!expandedGroups[group.key];
                return (
                  <Card key={group.key} padding="none">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={expanded}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {expanded ? (
                          <ChevronDown size={18} className="shrink-0 text-gray-500" />
                        ) : (
                          <ChevronRight size={18} className="shrink-0 text-gray-500" />
                        )}
                        <span className="font-semibold text-gray-900 truncate">
                          {group.customerName}
                        </span>
                        <span className="text-sm text-gray-500 shrink-0">
                          ({group.sales.length})
                        </span>
                      </span>
                      <span className="font-semibold text-gray-900 tabular-nums ml-4">
                        {formatArs(group.totalOwed)}
                      </span>
                    </button>
                    {expanded && (
                      <div className="border-t border-gray-100">
                        <Table
                          columns={[
                            { key: 'date', label: 'Fecha' },
                            {
                              key: 'type',
                              label: 'Tipo',
                              render: (value) => (
                                <Badge label={typeLabels[value as keyof typeof typeLabels]} />
                              ),
                            },
                            { key: 'quantity', label: 'Cantidad' },
                            {
                              key: 'total_price',
                              label: 'Total',
                              render: (value) => formatArs(value as number),
                            },
                            {
                              key: 'id',
                              label: 'Acciones',
                              render: (_, row: Sale) => (
                                <Button
                                  variant="success"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleMarkPaid(row.id);
                                  }}
                                  type="button"
                                  disabled={markingPaidId === row.id}
                                >
                                  <Check size={16} />
                                  {markingPaidId === row.id ? 'Guardando…' : 'Marcar pagada'}
                                </Button>
                              ),
                            },
                          ]}
                          data={group.sales}
                        />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Ventas ({periodLabel})</p>
            <p className="text-2xl font-bold text-gray-900">{formatArs(totalSales)}</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Huevos Vendidos ({periodLabel})</p>
            <p className="text-2xl font-bold text-gray-900">{totalEggsSold}</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Precio Promedio por Huevo</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatArs(avgPricePerEgg)}
            </p>
          </div>
        </Card>
      </div>

      <Card padding="md">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 md:items-end">
          <Select
            label="Año"
            options={yearOptions}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          />
          <Select
            label="Mes"
            options={VENTAS_MONTH_OPTIONS}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => downloadSalesExcel(sales, periodLabel)}
          >
            <FileSpreadsheet size={20} />
            Exportar
          </Button>
        </div>
      </Card>

      <Card padding="none">
        <Table
          columns={[
            { key: 'date', label: 'Fecha' },
            {
              key: 'customer_name',
              label: 'Cliente',
              render: (value) => value || UNASSIGNED_CUSTOMER_LABEL,
            },
            {
              key: 'type',
              label: 'Tipo',
              render: (value) => <Badge label={typeLabels[value as keyof typeof typeLabels]} />,
            },
            { key: 'quantity', label: 'Cantidad' },
            {
              key: 'price_per_unit',
              label: 'Precio Unitario',
              render: (value) => formatArs(value as number),
            },
            {
              key: 'total_price',
              label: 'Total',
              render: (value) => formatArs(value as number),
            },
            {
              key: 'is_paid',
              label: 'Cobro',
              render: (value) =>
                value ? (
                  <Badge label="Pagado" variant="success" />
                ) : (
                  <Badge label="Pendiente" variant="warning" />
                ),
            },
            {
              key: 'notes',
              label: 'Notas',
              render: (value) => value || '-',
            },
            {
              key: 'id',
              label: 'Acciones',
              render: (_, row: Sale) => (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleOpenModal(row)}>
                    <Pencil size={16} aria-hidden />
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(row.id)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              ),
            },
          ]}
          data={sales}
        />
      </Card>
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Editar Venta' : 'Nueva Venta'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <Input
            label="Fecha"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Cliente"
                  options={[
                    { value: '', label: UNASSIGNED_CUSTOMER_LABEL },
                    ...customers.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsQuickCustomerFormOpen((prev) => !prev)}
              >
                + Cliente
              </Button>
            </div>

            {isQuickCustomerFormOpen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg">
                <Input
                  label="Nombre"
                  value={newCustomerData.name}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                  required
                />
                <Input
                  label="Teléfono"
                  value={newCustomerData.phone}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                />
                <Input
                  label="Dirección"
                  value={newCustomerData.address}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, address: e.target.value })}
                />
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas del cliente</label>
                  <textarea
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[72px]"
                    value={newCustomerData.notes}
                    onChange={(e) => setNewCustomerData({ ...newCustomerData, notes: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="md:col-span-3">
                  <Button type="button" variant="primary" size="sm" onClick={handleQuickCreateCustomer}>
                    Guardar cliente
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Select
            label="Tipo de Venta"
            options={SALE_TYPE_OPTIONS}
            value={formData.type}
            onChange={(e) =>
              setFormData({ ...formData, type: e.target.value as Sale['type'] })
            }
          />

          <Input
            label="Cantidad de Unidades"
            type="number"
            min="0"
            step="1"
            value={numberInputValue(formData.quantity)}
            onChange={(e) =>
              setFormData({ ...formData, quantity: parseFormInt(e.target.value, 0) })
            }
            required
          />

          <Input
            label="Precio por Unidad"
            type="number"
            min="0"
            step="0.01"
            value={numberInputValue(formData.price_per_unit)}
            onChange={(e) =>
              setFormData({ ...formData, price_per_unit: parseFormFloat(e.target.value, 0) })
            }
            required
          />

          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600">
              Total:{' '}
              {formatArs(
                safeFormNumber(formData.quantity) * safeFormNumber(formData.price_per_unit)
              )}
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              checked={formData.is_paid}
              onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })}
            />
            <span className="text-sm font-medium text-gray-700">Pagado</span>
            <span className="text-xs text-gray-500">
              {formData.is_paid ? 'La venta queda cobrada.' : 'Queda pendiente en cuenta corriente.'}
            </span>
          </label>

          <Input
            label="Notas"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Ej: Cliente: Juan García"
          />

          <div className="flex gap-2 pt-4">
            <Button variant="primary" type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="secondary" onClick={handleCloseModal} className="flex-1" type="button">
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={eggStockWarning != null}
        onClose={() => setEggStockWarning(null)}
        title="Stock de huevos insuficiente"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            No hay suficiente stock de huevos {eggStockWarning?.sizeLabel}. ¿Te olvidaste de cargar la
            producción de hoy?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              onClick={() => {
                setEggStockWarning(null);
                handleCloseModal();
                onNavigate?.('produccion');
              }}
            >
              Cargar producción
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => void handleEggWarningContinue()}
              disabled={saving}
            >
              Guardar de todas formas
            </Button>
          </div>
        </div>
      </Modal>

      {mapleToast ? (
        <Toast message={mapleToast} onDismiss={() => setMapleToast(null)} />
      ) : null}
    </div>
  );
}
