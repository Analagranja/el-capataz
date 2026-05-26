import React from 'react';
import { Gallinero, GallineroFlock, MortalityLog } from '../types';
import { gallinerosService } from '../services/gallineros';
import { gallineroFlocksService, GallineroFlockInput } from '../services/gallineroFlocks';
import { mortalityLogsService } from '../services/mortalityLogs';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';
import { todayLocalYmd } from '../utils/monthToDateFinance';
import { flockAgeSummary } from '../utils/gallineroFlock';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { Plus, Pencil, Trash2, Egg, Eye } from 'lucide-react';

interface GallinerosProps {
  onRegisterProduction: (gallineroId: string) => void;
}

const MORTALITY_CAUSE_OPTIONS = [
  { value: 'Enfermedad', label: 'Enfermedad' },
  { value: 'Accidente', label: 'Accidente' },
  { value: 'Descarte', label: 'Descarte' },
  { value: 'Otra', label: 'Otra' },
];

type GallineroFormState = { name: string; color: string };

type NewFlockFormState = {
  name: string;
  current_count: number;
  birth_date: string;
  breed: string;
  feather_color: string;
  average_weight_kg: string;
  band_number: string;
  band_color: string;
  supplier: string;
  notes_flock: string;
};

function emptyGallineroForm(): GallineroFormState {
  return { name: '', color: '#3b82f6' };
}

function emptyNewFlockForm(defaultName: string): NewFlockFormState {
  return {
    name: defaultName,
    current_count: 0,
    birth_date: '',
    breed: '',
    feather_color: '',
    average_weight_kg: '',
    band_number: '',
    band_color: '',
    supplier: '',
    notes_flock: '',
  };
}

function activeFlocks(g: Gallinero): GallineroFlock[] {
  return (g.flocks ?? []).filter((f) => f.status === 'active');
}

function nextCamadaName(g: Gallinero): string {
  const n = (g.flocks ?? []).length + 1;
  return `Camada ${n}`;
}

function flockPayloadFromForm(form: NewFlockFormState): GallineroFlockInput {
  const weightRaw = form.average_weight_kg.trim();
  return {
    name: form.name.trim() || 'Camada 1',
    current_count: form.current_count,
    birth_date: form.birth_date.trim() || null,
    breed: form.breed.trim() || null,
    feather_color: form.feather_color.trim() || null,
    band_number: form.band_number.trim() || null,
    band_color: form.band_color.trim() || null,
    supplier: form.supplier.trim() || null,
    notes_flock: form.notes_flock.trim() || null,
    average_weight_kg: weightRaw ? Number(weightRaw) : null,
  };
}

function flockToForm(f: GallineroFlock): NewFlockFormState {
  return {
    name: f.name,
    current_count: f.current_count,
    birth_date: f.birth_date ? String(f.birth_date).slice(0, 10) : '',
    breed: f.breed ?? '',
    feather_color: f.feather_color ?? '',
    average_weight_kg: f.average_weight_kg != null ? String(f.average_weight_kg) : '',
    band_number: f.band_number ?? '',
    band_color: f.band_color ?? '',
    supplier: f.supplier ?? '',
    notes_flock: f.notes_flock ?? '',
  };
}

type EditingFlockEntry = {
  flock: GallineroFlock;
  form: NewFlockFormState;
  saving: boolean;
  error: string;
};

function FlockFormFields({
  form,
  onChange,
}: {
  form: NewFlockFormState;
  onChange: (form: NewFlockFormState) => void;
}) {
  return (
    <>
      <Input
        label="Nombre de la camada"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        required
      />
      <Input
        label="Cantidad de gallinas"
        type="number"
        min={1}
        value={form.current_count}
        onChange={(e) =>
          onChange({
            ...form,
            current_count: Math.max(0, parseInt(e.target.value, 10) || 0),
          })
        }
        required
      />
      <Input
        label="Fecha de nacimiento / ingreso"
        type="date"
        value={form.birth_date}
        onChange={(e) => onChange({ ...form, birth_date: e.target.value })}
      />
      <Input
        label="Raza"
        value={form.breed}
        onChange={(e) => onChange({ ...form, breed: e.target.value })}
        placeholder="Ej: Hy-Line Brown"
      />
      <Input
        label="Color de plumaje"
        value={form.feather_color}
        onChange={(e) => onChange({ ...form, feather_color: e.target.value })}
        placeholder="Ej: Marrón"
      />
      <div className="flex gap-2 items-end">
        <Input
          label="Peso promedio del lote"
          type="number"
          step="0.01"
          min={0}
          value={form.average_weight_kg}
          onChange={(e) => onChange({ ...form, average_weight_kg: e.target.value })}
          placeholder="Ej: 1.8"
          className="flex-1"
        />
        <span className="pb-2 text-sm text-gray-600 shrink-0">kg</span>
      </div>
      <Input
        label="N° de precinto"
        value={form.band_number}
        onChange={(e) => onChange({ ...form, band_number: e.target.value })}
      />
      <Input
        label="Color de precinto"
        value={form.band_color}
        onChange={(e) => onChange({ ...form, band_color: e.target.value })}
      />
      <Input
        label="Proveedor"
        value={form.supplier}
        onChange={(e) => onChange({ ...form, supplier: e.target.value })}
      />
      <div className="w-full">
        <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
        <textarea
          value={form.notes_flock}
          onChange={(e) => onChange({ ...form, notes_flock: e.target.value })}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3 text-sm">
      <span className="text-gray-500 shrink-0 sm:w-36">{label}</span>
      <span className="text-gray-900">{children}</span>
    </div>
  );
}

function FlockDetailBlock({ flock }: { flock: GallineroFlock }) {
  const age = flockAgeSummary(flock.birth_date);
  const weight =
    flock.average_weight_kg != null && Number.isFinite(Number(flock.average_weight_kg))
      ? Number(flock.average_weight_kg)
      : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-gray-900">{flock.name}</h4>
        <span className="text-sm font-medium text-gray-700 tabular-nums">{flock.current_count} gallinas</span>
      </div>
      {age.shortLine ? <p className="text-sm text-gray-600">{age.shortLine}</p> : null}
      <DetailRow label="Estado postura">{age.phaseLabel}</DetailRow>
      <DetailRow label="Raza">{flock.breed?.trim() || '—'}</DetailRow>
      <DetailRow label="Plumaje">{flock.feather_color?.trim() || '—'}</DetailRow>
      <DetailRow label="Peso promedio">{weight != null ? `${weight} kg` : '—'}</DetailRow>
      <DetailRow label="Nacimiento / ingreso">
        {flock.birth_date ? String(flock.birth_date).slice(0, 10) : '—'}
      </DetailRow>
      <DetailRow label="Precinto">
        {flock.band_number?.trim()
          ? `${flock.band_number}${flock.band_color?.trim() ? ` (${flock.band_color})` : ''}`
          : '—'}
      </DetailRow>
      <DetailRow label="Proveedor">{flock.supplier?.trim() || '—'}</DetailRow>
      <DetailRow label="Observaciones">
        {flock.notes_flock?.trim() ? (
          <span className="whitespace-pre-wrap">{flock.notes_flock}</span>
        ) : (
          '—'
        )}
      </DetailRow>
    </div>
  );
}

export default function Gallineros({ onRegisterProduction }: GallinerosProps) {
  const { organizationId } = useAuth();
  const { canManageCoops } = useRole();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Gallinero | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<GallineroFormState>(emptyGallineroForm);
  const [editingFlocks, setEditingFlocks] = React.useState<EditingFlockEntry[]>([]);

  const [detailTarget, setDetailTarget] = React.useState<Gallinero | null>(null);
  const [detailLogs, setDetailLogs] = React.useState<MortalityLog[]>([]);
  const [detailLogsLoading, setDetailLogsLoading] = React.useState(false);

  const [newFlockOpen, setNewFlockOpen] = React.useState(false);
  const [newFlockSaving, setNewFlockSaving] = React.useState(false);
  const [newFlockForm, setNewFlockForm] = React.useState<NewFlockFormState>(emptyNewFlockForm('Camada 1'));

  const [mortalityOpen, setMortalityOpen] = React.useState(false);
  const [mortalitySaving, setMortalitySaving] = React.useState(false);
  const [mortalityError, setMortalityError] = React.useState('');
  const [mortalityFlockId, setMortalityFlockId] = React.useState('');
  const [mortalityForm, setMortalityForm] = React.useState({
    date: todayLocalYmd(),
    count: 1,
    cause: 'Enfermedad',
    notes: '',
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
      if (detailTarget) {
        const fresh = data.find((g) => g.id === detailTarget.id);
        if (fresh) setDetailTarget(fresh);
      }
    } catch (error) {
      console.error('Error loading gallineros:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDetailLogs = async (gallineroId: string) => {
    if (!organizationId) return;
    setDetailLogsLoading(true);
    try {
      const logs = await mortalityLogsService.getByGallinero(organizationId, gallineroId, 5);
      setDetailLogs(logs);
    } catch (error) {
      console.error('Error loading mortality logs:', error);
      setDetailLogs([]);
    } finally {
      setDetailLogsLoading(false);
    }
  };

  React.useEffect(() => {
    loadGallineros(organizationId);
  }, [organizationId]);

  const detailActiveFlocks = detailTarget ? activeFlocks(detailTarget) : [];

  const handleOpenModal = (gallinero?: Gallinero) => {
    if (!canManageCoops()) return;
    if (gallinero) {
      setEditingId(gallinero.id);
      setFormData({ name: gallinero.name, color: gallinero.color });
      const flocks = activeFlocks(gallinero);
      setEditingFlocks(
        flocks.map((f) => ({
          flock: f,
          form: flockToForm(f),
          saving: false,
          error: '',
        }))
      );
    } else {
      setEditingId(null);
      setFormData(emptyGallineroForm());
      setEditingFlocks([]);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setEditingFlocks([]);
  };

  const updateEditingFlockForm = (flockId: string, form: NewFlockFormState) => {
    setEditingFlocks((prev) =>
      prev.map((entry) =>
        entry.flock.id === flockId ? { ...entry, form, error: '' } : entry
      )
    );
  };

  const handleSaveEditingFlock = async (flockId: string) => {
    if (!organizationId || !canManageCoops()) return;
    const idx = editingFlocks.findIndex((e) => e.flock.id === flockId);
    if (idx < 0) return;
    const entry = editingFlocks[idx];
    if (entry.form.current_count < 1) {
      setEditingFlocks((prev) =>
        prev.map((e, i) =>
          i === idx ? { ...e, error: 'La cantidad debe ser al menos 1.' } : e
        )
      );
      return;
    }
    setEditingFlocks((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, saving: true, error: '' } : e))
    );
    try {
      const updated = await gallineroFlocksService.update(
        organizationId,
        flockId,
        flockPayloadFromForm(entry.form)
      );
      setEditingFlocks((prev) =>
        prev.map((e, i) =>
          i === idx
            ? { flock: updated, form: flockToForm(updated), saving: false, error: '' }
            : e
        )
      );
      await loadGallineros();
    } catch (error) {
      console.error('Error updating flock:', error);
      setEditingFlocks((prev) =>
        prev.map((e, i) =>
          i === idx
            ? { ...e, saving: false, error: 'No se pudo guardar la camada. Reintentá.' }
            : e
        )
      );
    }
  };

  const handleOpenDetail = async (gallinero: Gallinero) => {
    setDetailTarget(gallinero);
    setDetailLogs([]);
    setMortalityOpen(false);
    await loadDetailLogs(gallinero.id);
  };

  const handleCloseDetail = () => {
    setDetailTarget(null);
    setDetailLogs([]);
    setMortalityOpen(false);
    setNewFlockOpen(false);
    setMortalityError('');
  };

  const handleOpenNewFlock = () => {
    if (!detailTarget) return;
    setNewFlockForm(emptyNewFlockForm(nextCamadaName(detailTarget)));
    setNewFlockOpen(true);
  };

  const handleCloseNewFlock = () => {
    if (newFlockSaving) return;
    setNewFlockOpen(false);
  };

  const handleSubmitNewFlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !detailTarget || !canManageCoops()) return;
    if (newFlockForm.current_count < 1) return;
    setNewFlockSaving(true);
    try {
      await gallineroFlocksService.create(
        organizationId,
        detailTarget.id,
        flockPayloadFromForm(newFlockForm)
      );
      setNewFlockOpen(false);
      await loadGallineros();
      await loadDetailLogs(detailTarget.id);
    } catch (error) {
      console.error('Error creating flock:', error);
    } finally {
      setNewFlockSaving(false);
    }
  };

  const handleRetireFlock = async (flock: GallineroFlock) => {
    if (!organizationId || !detailTarget || !canManageCoops()) return;
    const ok = window.confirm(
      `¿Retirar la camada "${flock.name}"? Dejará de sumar al total del gallinero (${flock.current_count} gallinas en esta camada).`
    );
    if (!ok) return;
    try {
      await gallineroFlocksService.retire(organizationId, flock.id);
      await loadGallineros();
      await loadDetailLogs(detailTarget.id);
    } catch (error) {
      console.error('Error retiring flock:', error);
    }
  };

  const handleOpenMortality = () => {
    if (!detailTarget) return;
    const actives = activeFlocks(detailTarget);
    if (actives.length === 0) {
      window.alert('No hay camadas activas. Creá una camada antes de registrar bajas.');
      return;
    }
    setMortalityForm({
      date: todayLocalYmd(),
      count: 1,
      cause: 'Enfermedad',
      notes: '',
    });
    setMortalityFlockId(actives.length === 1 ? actives[0].id : '');
    setMortalityError('');
    setMortalityOpen(true);
  };

  const handleCloseMortality = () => {
    if (mortalitySaving) return;
    setMortalityOpen(false);
    setMortalityError('');
  };

  const selectedMortalityFlock = React.useMemo(() => {
    if (!detailTarget || !mortalityFlockId) return null;
    return activeFlocks(detailTarget).find((f) => f.id === mortalityFlockId) ?? null;
  }, [detailTarget, mortalityFlockId]);

  const mortalityPreview = React.useMemo(() => {
    if (!detailTarget || !selectedMortalityFlock) return null;
    const flockCurrent = Math.max(0, Math.floor(Number(selectedMortalityFlock.current_count) || 0));
    const gallineroCurrent = Math.max(0, Math.floor(Number(detailTarget.current_count) || 0));
    const loss = Math.max(1, Math.floor(Number(mortalityForm.count) || 0));
    const flockAfter = Math.max(0, flockCurrent - loss);
    const gallineroAfter = Math.max(0, gallineroCurrent - loss);
    return { flockCurrent, gallineroCurrent, loss, flockAfter, gallineroAfter };
  }, [detailTarget, selectedMortalityFlock, mortalityForm.count]);

  const handleSubmitMortality = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !detailTarget || !mortalityPreview || !mortalityFlockId) return;
    if (detailActiveFlocks.length > 1 && !mortalityFlockId) {
      setMortalityError('Seleccioná la camada.');
      return;
    }
    const loss = mortalityPreview.loss;
    const flockName = selectedMortalityFlock?.name ?? 'camada';
    const ok = window.confirm(
      `¿Registrar ${loss} baja(s) en "${flockName}"?\n\n` +
        `Camada: ${mortalityPreview.flockCurrent} → ${mortalityPreview.flockAfter} gallinas\n` +
        `Total gallinero: ${mortalityPreview.gallineroCurrent} → ${mortalityPreview.gallineroAfter} gallinas`
    );
    if (!ok) return;

    setMortalitySaving(true);
    setMortalityError('');
    try {
      await mortalityLogsService.create(
        organizationId,
        detailTarget.id,
        mortalityForm.date,
        loss,
        mortalityForm.cause,
        mortalityForm.notes,
        mortalityFlockId
      );
      setMortalityOpen(false);
      await loadGallineros();
      await loadDetailLogs(detailTarget.id);
    } catch (error) {
      console.error('Error saving mortality:', error);
      setMortalityError('No se pudo registrar la baja. Reintentá.');
    } finally {
      setMortalitySaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCoops() || !organizationId) return;
    try {
      if (editingId) {
        await gallinerosService.update(organizationId, editingId, {
          name: formData.name,
          color: formData.color,
        });
      } else {
        await gallinerosService.create(organizationId, formData.name, formData.color);
      }
      loadGallineros();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving gallinero:', error);
    }
  };

  const handleRequestDelete = (g: Gallinero) => {
    if (!canManageCoops()) return;
    setDeleteTarget(g);
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!canManageCoops()) return;
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

  const flockNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of gallineros) {
      for (const f of g.flocks ?? []) {
        m.set(f.id, f.name);
      }
    }
    return m;
  }, [gallineros]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-3xl font-bold text-gray-900">Gallineros</h2>
        {canManageCoops() ? (
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus size={20} />
            Nuevo gallinero
          </Button>
        ) : null}
      </div>

      {gallineros.length === 0 ? (
        <Card padding="md">
          <div className="py-8 text-center space-y-4">
            <p className="text-gray-600">No hay gallineros registrados</p>
            {canManageCoops() ? (
              <Button variant="primary" onClick={() => handleOpenModal()}>
                <Plus size={20} />
                Nuevo gallinero
              </Button>
            ) : (
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Pedile a un administrador de la granja que dé de alta el primer gallinero.
              </p>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gallineros.map((gallinero) => {
            const actives = activeFlocks(gallinero);
            return (
              <Card key={gallinero.id} padding="md" hover>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{gallinero.name}</h3>
                    <div
                      className="w-8 h-8 rounded-full border-2 border-gray-200"
                      style={{ backgroundColor: gallinero.color }}
                    />
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Gallinas (activas):</span>
                      <span className="font-semibold text-gray-900 tabular-nums">
                        {gallinero.current_count}
                      </span>
                    </div>
                    {actives.length > 0 ? (
                      <ul className="space-y-1 pt-1 border-t border-gray-100">
                        {actives.map((f) => {
                          const age = flockAgeSummary(f.birth_date);
                          return (
                            <li key={f.id} className="text-gray-600">
                              <span className="font-medium text-gray-800">{f.name}</span>
                              {' · '}
                              <span className="tabular-nums">{f.current_count}</span>
                              {age.shortLine ? (
                                <span className="block text-xs text-gray-500">{age.shortLine}</span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500">Sin camadas activas</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onRegisterProduction(gallinero.id)}
                      className="w-full"
                    >
                      <Egg size={16} />
                      Registrar Producción
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenDetail(gallinero)}
                      className="w-full"
                    >
                      <Eye size={16} />
                      Ver detalle
                    </Button>
                  </div>

                  {canManageCoops() ? (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenModal(gallinero)}
                        className="flex-1"
                        title="Editar"
                      >
                        <Pencil size={16} aria-hidden />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRequestDelete(gallinero)}
                        className="flex-1"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 pt-1">Solo lectura · edición solo administradores</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!detailTarget}
        onClose={handleCloseDetail}
        title={detailTarget ? `Detalle — ${detailTarget.name}` : 'Detalle'}
      >
        {detailTarget ? (
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full border-2 border-gray-200 shrink-0"
                style={{ backgroundColor: detailTarget.color }}
              />
              <div>
                <p className="font-semibold text-gray-900">{detailTarget.name}</p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900 tabular-nums">{detailTarget.current_count}</span>{' '}
                  gallinas (suma camadas activas)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-800">Camadas activas</h4>
              {detailActiveFlocks.length === 0 ? (
                <p className="text-sm text-gray-500">No hay camadas activas. Agregá una con el botón de abajo.</p>
              ) : (
                detailActiveFlocks.map((flock) => (
                  <div key={flock.id} className="space-y-2">
                    <FlockDetailBlock flock={flock} />
                    {canManageCoops() ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        className="w-full"
                        onClick={() => handleRetireFlock(flock)}
                      >
                        Retirar camada
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {canManageCoops() ? (
              <Button variant="secondary" type="button" onClick={handleOpenNewFlock} className="w-full">
                <Plus size={16} />
                Nueva camada
              </Button>
            ) : null}

            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Últimas bajas registradas</h4>
              {detailLogsLoading ? (
                <p className="text-sm text-gray-500">Cargando…</p>
              ) : detailLogs.length === 0 ? (
                <p className="text-sm text-gray-500">Sin bajas registradas.</p>
              ) : (
                <ul className="text-sm space-y-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {detailLogs.map((log) => (
                    <li key={log.id} className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="font-medium text-gray-900">{String(log.date).slice(0, 10)}</span>
                      <span className="text-gray-700 tabular-nums">{log.count} baja(s)</span>
                      {log.flock_id && flockNameById.get(log.flock_id) ? (
                        <span className="text-gray-600">{flockNameById.get(log.flock_id)}</span>
                      ) : null}
                      {log.cause ? <span className="text-gray-600">{log.cause}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button variant="secondary" type="button" onClick={handleOpenMortality} className="w-full">
              Registrar baja
            </Button>

            <Button variant="secondary" type="button" onClick={handleCloseDetail} className="w-full">
              Cerrar
            </Button>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={newFlockOpen && !!detailTarget} onClose={handleCloseNewFlock} title="Nueva camada">
        <form onSubmit={handleSubmitNewFlock} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <FlockFormFields form={newFlockForm} onChange={setNewFlockForm} />
          <div className="flex gap-2 pt-2">
            <Button variant="primary" type="submit" className="flex-1" disabled={newFlockSaving}>
              {newFlockSaving ? 'Guardando…' : 'Guardar camada'}
            </Button>
            <Button
              variant="secondary"
              type="button"
              className="flex-1"
              disabled={newFlockSaving}
              onClick={handleCloseNewFlock}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={mortalityOpen && !!detailTarget}
        onClose={handleCloseMortality}
        title="Registrar baja"
      >
        {detailTarget ? (
          <form onSubmit={handleSubmitMortality} className="space-y-4">
            {detailActiveFlocks.length > 1 ? (
              <Select
                label="Camada"
                options={detailActiveFlocks.map((f) => ({
                  value: f.id,
                  label: `${f.name} (${f.current_count} gallinas)`,
                }))}
                value={mortalityFlockId}
                onChange={(e) => setMortalityFlockId(e.target.value)}
                required
              />
            ) : detailActiveFlocks.length === 1 ? (
              <p className="text-sm text-gray-600">
                Camada: <span className="font-medium text-gray-900">{detailActiveFlocks[0].name}</span>
              </p>
            ) : null}

            {mortalityPreview ? (
              <>
                <Input
                  label="Fecha"
                  type="date"
                  value={mortalityForm.date}
                  onChange={(e) => setMortalityForm({ ...mortalityForm, date: e.target.value })}
                  required
                />
                <Input
                  label="Cantidad de bajas"
                  type="number"
                  min={1}
                  value={mortalityForm.count}
                  onChange={(e) =>
                    setMortalityForm({
                      ...mortalityForm,
                      count: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                  required
                />
                <Select
                  label="Causa"
                  options={MORTALITY_CAUSE_OPTIONS}
                  value={mortalityForm.cause}
                  onChange={(e) => setMortalityForm({ ...mortalityForm, cause: e.target.value })}
                />
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                  <textarea
                    value={mortalityForm.notes}
                    onChange={(e) => setMortalityForm({ ...mortalityForm, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-1">
                  <p>
                    Camada: <span className="font-semibold tabular-nums">{mortalityPreview.flockCurrent}</span> →{' '}
                    <span className="font-semibold tabular-nums">{mortalityPreview.flockAfter}</span> gallinas
                  </p>
                  <p>
                    Total gallinero:{' '}
                    <span className="font-semibold tabular-nums">{mortalityPreview.gallineroCurrent}</span> →{' '}
                    <span className="font-semibold tabular-nums">{mortalityPreview.gallineroAfter}</span> gallinas
                  </p>
                </div>

                {mortalityError ? <p className="text-sm text-red-600">{mortalityError}</p> : null}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="primary"
                    type="submit"
                    className="flex-1"
                    disabled={mortalitySaving || !mortalityFlockId}
                  >
                    {mortalitySaving ? 'Guardando…' : 'Confirmar y registrar'}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    className="flex-1"
                    disabled={mortalitySaving}
                    onClick={handleCloseMortality}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Seleccioná una camada para continuar.</p>
            )}
          </form>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!deleteTarget}
        onClose={handleCloseDeleteModal}
        title="Eliminar gallinero"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-amber-950">
              ¿Estás seguro? Esta acción es irreversible y se borrarán{' '}
              <span className="font-semibold">todos</span> los registros de producción, camadas y eventos vinculados.
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

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Editar Gallinero' : 'Nuevo Gallinero'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[85vh] overflow-y-auto pr-1">
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

          {editingId && editingFlocks.length > 0 ? (
            <div className="space-y-4 pt-2 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-800">Camadas activas</h4>
              {editingFlocks.map((entry) => (
                <div
                  key={entry.flock.id}
                  className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4"
                >
                  <h5 className="font-medium text-gray-900">{entry.flock.name}</h5>
                  <FlockFormFields
                    form={entry.form}
                    onChange={(form) => updateEditingFlockForm(entry.flock.id, form)}
                  />
                  {entry.error ? <p className="text-sm text-red-600">{entry.error}</p> : null}
                  <Button
                    variant="secondary"
                    type="button"
                    className="w-full"
                    disabled={entry.saving}
                    onClick={() => handleSaveEditingFlock(entry.flock.id)}
                  >
                    {entry.saving ? 'Guardando…' : 'Guardar cambios de esta camada'}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

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
