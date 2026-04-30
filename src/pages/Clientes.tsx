import React from 'react';
import { Customer } from '../types';
import { customersService } from '../services/customers';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import { downloadCustomersExcel } from '../utils/exportFarmData';
import { Plus, FileSpreadsheet, Pencil } from 'lucide-react';

function whatsappChatUrl(phone: string | undefined | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

export default function Clientes() {
  const { organizationId } = useAuth();
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [formData, setFormData] = React.useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });

  const loadCustomers = async (silent = false) => {
    if (!organizationId) return;
    try {
      if (!silent) setLoading(true);
      const data = await customersService.getAll(organizationId);
      setCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  React.useEffect(() => {
    loadCustomers(false);
  }, [organizationId]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setSaveError('');
    setFormData({ name: '', phone: '', address: '', notes: '' });
  };

  const openNewCustomer = () => {
    setEditingId(null);
    setSaveError('');
    setFormData({ name: '', phone: '', address: '', notes: '' });
    setIsModalOpen(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingId(c.id);
    setSaveError('');
    setFormData({
      name: c.name,
      phone: c.phone ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!organizationId || !formData.name.trim()) return;
    try {
      setSaving(true);
      if (editingId) {
        await customersService.update(organizationId, editingId, {
          name: formData.name.trim(),
          phone: formData.phone,
          address: formData.address,
          notes: formData.notes,
        });
      } else {
        await customersService.create(
          organizationId,
          formData.name.trim(),
          formData.phone.trim(),
          formData.address.trim(),
          formData.notes.trim()
        );
      }
      handleCloseModal();
      await loadCustomers(true);
    } catch (error: unknown) {
      console.error('Error saving customer:', error);
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : 'No se pudo guardar. Si acabas de agregar notas, aplicá la migración en Supabase (columna notes).';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-3xl font-bold text-gray-900">Clientes</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadCustomersExcel(customers)}>
            <FileSpreadsheet size={20} />
            Exportar a Excel
          </Button>
          <Button variant="primary" onClick={openNewCustomer}>
            <Plus size={20} />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      <Card padding="md" hover>
        <Table<Customer>
          columns={[
            { key: 'name', label: 'Nombre' },
            {
              key: 'phone',
              label: 'Teléfono',
              render: (value, row) => {
                const phone = (value as string) || '';
                const wa = whatsappChatUrl(phone);
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{phone || '—'}</span>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'id',
              label: 'Acciones',
              render: (_, row) => (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditCustomer(row)}
                  aria-label={`Editar ${row.name}`}
                >
                  <Pencil size={16} aria-hidden />
                </Button>
              ),
            },
          ]}
          data={customers}
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Editar cliente' : 'Nuevo cliente'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {saveError}
            </div>
          )}
          <Input
            label="Nombre"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Nombre o razón social"
          />
          <Input
            label="Teléfono"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="Ej: +506 8888-8888"
          />
          <Input
            label="Dirección"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[88px] text-sm"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Recordatorios, preferencias, etc."
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="primary" type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" variant="secondary" onClick={handleCloseModal} className="flex-1" disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
