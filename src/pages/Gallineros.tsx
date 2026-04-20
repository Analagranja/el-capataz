import React from 'react';
import { Gallinero } from '../types';
import { gallinerosService } from '../services/gallineros';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { Plus, CreditCard as Edit2, Trash2, Egg } from 'lucide-react';

interface GallinerosProps {
  onRegisterProduction: (gallineroId: string) => void;
}

export default function Gallineros({ onRegisterProduction }: GallinerosProps) {
  const { organizationId } = useAuth();
  const { isAdmin } = useRole();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Gallinero | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    name: '',
    color: '#3b82f6',
    current_count: 0,
  });

  const loadGallineros = async (currentOrganizationId = organizationId) => {
    if (!currentOrganizationId) {
      setGallineros([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await gallinerosService.getAll(currentOrganizationId);
      setGallineros(data);
    } catch (error) {
      console.error('Error loading gallineros:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadGallineros(organizationId);
  }, [organizationId]);

  const handleOpenModal = (gallinero?: Gallinero) => {
    if (gallinero) {
      setEditingId(gallinero.id);
      setFormData({
        name: gallinero.name,
        color: gallinero.color,
        current_count: gallinero.current_count,
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        color: '#3b82f6',
        current_count: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    try {
      if (editingId) {
        await gallinerosService.update(organizationId, editingId, formData);
      } else {
        await gallinerosService.create(
          organizationId,
          formData.name,
          formData.color,
          formData.current_count
        );
      }
      loadGallineros();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving gallinero:', error);
    }
  };

  const handleRequestDelete = (g: Gallinero) => {
    if (!isAdmin) return;
    setDeleteTarget(g);
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!isAdmin) return;
    if (!organizationId || !deleteTarget) return;
    setDeleting(true);
    try {
      await gallinerosService.delete(organizationId, deleteTarget.id);
      setDeleteTarget(null);
      await loadGallineros();
    } catch (error) {
      console.error('Error deleting gallinero:', error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-gray-900">Gallineros</h2>
        <Button variant="primary" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          Nuevo Gallinero
        </Button>
      </div>

      {gallineros.length === 0 ? (
        <Card padding="md">
          <div className="py-8 text-center space-y-4">
            <p className="text-gray-600">No hay gallineros registrados</p>
            <Button variant="primary" onClick={() => handleOpenModal()}>
              <Plus size={20} />
              Nuevo Gallinero
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gallineros.map((gallinero) => (
            <Card key={gallinero.id} padding="md" hover>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">{gallinero.name}</h3>
                  <div
                    className="w-8 h-8 rounded-full border-2 border-gray-200"
                    style={{ backgroundColor: gallinero.color }}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Gallinas:</span>
                    <span className="font-semibold text-gray-900">
                      {gallinero.current_count}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onRegisterProduction(gallinero.id)}
                    className="flex-1"
                  >
                    <Egg size={16} />
                    Registrar Producción
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenModal(gallinero)}
                    className="flex-1"
                  >
                    <Edit2 size={16} />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRequestDelete(gallinero)}
                      className="flex-1"
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={handleCloseDeleteModal}
        title="Eliminar gallinero"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-amber-950">
              ¿Estás seguro? Esta acción es irreversible y se borrarán{' '}
              <span className="font-semibold">todos</span> los registros de producción y eventos vinculados a este
              gallinero (en la base de datos también se eliminan en cascada).
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Gallinero: <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto sm:min-w-[7rem]"
              disabled={deleting}
              onClick={handleCloseDeleteModal}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              className="w-full border-2 border-red-800 shadow-md sm:w-auto sm:min-w-[10rem] font-semibold"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingId ? 'Editar Gallinero' : 'Nuevo Gallinero'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ej: Gallinero A"
            required
          />

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <input
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-full h-10 rounded-lg cursor-pointer"
            />
          </div>

          <Input
            label="Cantidad de Gallinas"
            type="number"
            value={formData.current_count}
            onChange={(e) => setFormData({ ...formData, current_count: parseInt(e.target.value) || 0 })}
            required
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
