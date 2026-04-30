import React from 'react';
import { Customer, Sale } from '../types';
import { salesService } from '../services/sales';
import { customersService } from '../services/customers';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { formatArs } from '../utils/formatCurrency';

const SALE_TYPE_OPTIONS: Array<{ value: Sale['type']; label: string }> = [
  { value: 'maple', label: 'Maple (30 huevos)' },
  { value: 'docena', label: 'Docena (12 huevos)' },
  { value: 'media_docena', label: 'Media Docena (6 huevos)' },
];

export default function Ventas() {
  const { organizationId } = useAuth();
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isQuickCustomerFormOpen, setIsQuickCustomerFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>('');
  const [formData, setFormData] = React.useState({
    date: new Date().toISOString().split('T')[0],
    customer_id: '',
    type: 'docena' as 'maple' | 'docena' | 'media_docena',
    quantity: 0,
    price_per_unit: 0,
    notes: '',
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
      if (!editingId && data.length > 0) {
        setFormData((prev) => ({ ...prev, customer_id: prev.customer_id || data[0].id }));
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const loadSales = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth(); // 0-based
      const fromDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const toDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const data = await salesService.getAllRange(organizationId, fromDate, toDate);
      setSales(data);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadSales();
    loadCustomers();
  }, [organizationId]);

  const handleOpenModal = (sale?: Sale) => {
    if (sale) {
      setEditingId(sale.id);
      setFormData({
        date: sale.date,
        customer_id: sale.customer_id || '',
        type: sale.type,
        quantity: sale.quantity,
        price_per_unit: sale.price_per_unit,
        notes: sale.notes || '',
      });
    } else {
      setEditingId(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        customer_id: customers[0]?.id || '',
        type: 'docena',
        quantity: 0,
        price_per_unit: 0,
        notes: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!organizationId || !formData.customer_id) return;
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
          formData.notes
        );
      } else {
        await salesService.create(
          organizationId,
          formData.date,
          formData.customer_id,
          formData.type,
          formData.quantity,
          formData.price_per_unit,
          formData.notes
        );
      }
      loadSales();
      handleCloseModal();
    } catch (err: any) {
      console.error('Error saving sale:', err);
      const msg =
        (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' ? err.message : '') ||
        'No se pudo guardar la venta.';
      setError(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!organizationId) return;
    if (window.confirm('¿Está seguro?')) {
      try {
        await salesService.delete(organizationId, id);
        loadSales();
      } catch (error) {
        console.error('Error deleting sale:', error);
      }
    }
  };

  const typeLabels = {
    maple: 'Maple (30)',
    docena: 'Docena (12)',
    media_docena: 'Media Docena (6)',
  };
  const eggsPerSaleType: Record<Sale['type'], number> = {
    maple: 30,
    docena: 12,
    media_docena: 6,
  };

  const totalSales = sales.reduce((sum, s) => sum + s.total_price, 0);
  const totalEggsSold = sales.reduce(
    (sum, sale) => sum + sale.quantity * (eggsPerSaleType[sale.type] || 0),
    0
  );
  const avgPricePerEgg = totalEggsSold > 0 ? totalSales / totalEggsSold : 0;

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Ventas (mes actual)</p>
            <p className="text-2xl font-bold text-gray-900">{formatArs(totalSales)}</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Huevos Vendidos (mes actual)</p>
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

      <Card padding="none">
        <Table
          columns={[
            { key: 'date', label: 'Fecha' },
            {
              key: 'customer_name',
              label: 'Cliente',
              render: (value) => value || 'Sin cliente',
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
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                  required
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
              setFormData({ ...formData, type: e.target.value as 'maple' | 'docena' | 'media_docena' })
            }
          />

          <Input
            label="Cantidad de Unidades"
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
            required
          />

          <Input
            label="Precio por Unidad"
            type="number"
            step="0.01"
            value={formData.price_per_unit}
            onChange={(e) => setFormData({ ...formData, price_per_unit: parseFloat(e.target.value) })}
            required
          />

          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600">
              Total: {formatArs(formData.quantity * formData.price_per_unit)}
            </p>
          </div>

          <Input
            label="Notas"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Ej: Cliente: Juan García"
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
    </div>
  );
}
