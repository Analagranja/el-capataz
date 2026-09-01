import React from 'react';
import { FeedConsumptionMonthly, Gallinero } from '../types';
import { feedConsumptionMonthlyService } from '../services/feedConsumptionMonthly';
import { formatUnknownError } from '../services/inventoryStockCalc';
import { feedConsumptionScopeConflict } from '../utils/feedConsumptionScope';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';

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

const MONTH_OPTIONS = MONTH_LABELS.map((label, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label,
}));

const FARM_SCOPE = '';

function lastClosedYearMonth(now = new Date()): { year: string; month: string } {
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setMonth(d.getMonth() - 1);
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
  };
}

function isCurrentCalendarMonth(year: number, month: number, now = new Date()): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1;
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  gallineros: Gallinero[];
  /** Aves activas de toda la granja (alcance "Toda la granja"). */
  activeHens: number;
  /** Preseleccionar gallinero al abrir (p. ej. filtro de Producción). */
  initialGallineroId?: string | null;
  /** Si vienen de un recordatorio, preseleccionar ese período. */
  initialYear?: number;
  initialMonth?: number;
  onSaved: (saved: FeedConsumptionMonthly) => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
};

export default function DeclareMonthlyFeedModal({
  isOpen,
  onClose,
  organizationId,
  gallineros,
  activeHens,
  initialGallineroId,
  initialYear,
  initialMonth,
  onSaved,
  onDeleted,
}: Props) {
  const now = React.useMemo(() => new Date(), []);
  const defaults = React.useMemo(() => {
    if (
      initialYear != null &&
      initialMonth != null &&
      Number.isFinite(initialYear) &&
      Number.isFinite(initialMonth) &&
      initialMonth >= 1 &&
      initialMonth <= 12
    ) {
      return {
        year: String(initialYear),
        month: String(initialMonth).padStart(2, '0'),
      };
    }
    return lastClosedYearMonth(now);
  }, [now, initialYear, initialMonth]);

  const initialScope = React.useMemo(() => {
    const id = String(initialGallineroId ?? '').trim();
    if (id && gallineros.some((g) => g.id === id)) return id;
    return FARM_SCOPE;
  }, [initialGallineroId, gallineros]);

  const [year, setYear] = React.useState(defaults.year);
  const [month, setMonth] = React.useState(defaults.month);
  const [scopeGallineroId, setScopeGallineroId] = React.useState(initialScope);
  const [kgConsumed, setKgConsumed] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [existing, setExisting] = React.useState<FeedConsumptionMonthly | null>(null);
  const [monthDeclarations, setMonthDeclarations] = React.useState<FeedConsumptionMonthly[]>([]);
  const [loadingExisting, setLoadingExisting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [currentMonthWarningOpen, setCurrentMonthWarningOpen] = React.useState(false);

  const yearOptions = React.useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 4 }, (_, i) => {
      const value = String(y - i);
      return { value, label: value };
    });
  }, [now]);

  const scopeOptions = React.useMemo(
    () => [
      { value: FARM_SCOPE, label: 'Toda la granja' },
      ...gallineros.map((g) => ({
        value: g.id,
        label: g.name,
      })),
    ],
    [gallineros]
  );

  const yearNum = Number(year);
  const monthNum = Number(month);
  const periodLabel =
    Number.isFinite(yearNum) && Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12
      ? `${MONTH_LABELS[monthNum - 1]} ${yearNum}`
      : '—';

  const scopeHens = React.useMemo(() => {
    if (scopeGallineroId === FARM_SCOPE) {
      return Math.max(0, Math.floor(Number(activeHens) || 0));
    }
    const g = gallineros.find((item) => item.id === scopeGallineroId);
    return Math.max(0, Math.floor(Number(g?.current_count) || 0));
  }, [scopeGallineroId, activeHens, gallineros]);

  const scopeLabel =
    scopeGallineroId === FARM_SCOPE
      ? 'Toda la granja'
      : gallineros.find((g) => g.id === scopeGallineroId)?.name ?? 'Gallinero';

  const scopeConflict = React.useMemo(
    () => feedConsumptionScopeConflict(scopeGallineroId, monthDeclarations, existing?.id),
    [scopeGallineroId, monthDeclarations, existing?.id]
  );

  const gallineroNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const g of gallineros) map.set(g.id, g.name);
    return map;
  }, [gallineros]);

  const reloadMonthDeclarations = React.useCallback(async () => {
    if (!organizationId || !Number.isFinite(yearNum) || !Number.isFinite(monthNum)) return [];
    const rows = await feedConsumptionMonthlyService.getAllForPeriod(
      organizationId,
      yearNum,
      monthNum
    );
    setMonthDeclarations(rows);
    return rows;
  }, [organizationId, yearNum, monthNum]);

  const resetFormForOpen = React.useCallback(() => {
    const d =
      initialYear != null &&
      initialMonth != null &&
      Number.isFinite(initialYear) &&
      Number.isFinite(initialMonth) &&
      initialMonth >= 1 &&
      initialMonth <= 12
        ? {
            year: String(initialYear),
            month: String(initialMonth).padStart(2, '0'),
          }
        : lastClosedYearMonth(new Date());
    setYear(d.year);
    setMonth(d.month);
    setScopeGallineroId(initialScope);
    setKgConsumed('');
    setNotes('');
    setExisting(null);
    setMonthDeclarations([]);
    setError('');
    setCurrentMonthWarningOpen(false);
  }, [initialYear, initialMonth, initialScope]);

  React.useEffect(() => {
    if (!isOpen) return;
    resetFormForOpen();
  }, [isOpen, resetFormForOpen]);

  React.useEffect(() => {
    if (!isOpen || !organizationId) return;
    if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum)) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await feedConsumptionMonthlyService.getAllForPeriod(
          organizationId,
          yearNum,
          monthNum
        );
        if (!cancelled) setMonthDeclarations(rows);
      } catch (e) {
        console.error('Error loading month feed declarations:', e);
        if (!cancelled) setMonthDeclarations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, yearNum, monthNum]);

  React.useEffect(() => {
    if (!isOpen || !organizationId) return;
    if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum)) return;
    let cancelled = false;
    (async () => {
      setLoadingExisting(true);
      try {
        const gallineroParam = scopeGallineroId === FARM_SCOPE ? null : scopeGallineroId;
        const row = await feedConsumptionMonthlyService.getByPeriod(
          organizationId,
          yearNum,
          monthNum,
          gallineroParam
        );
        if (cancelled) return;
        setExisting(row);
        if (row) {
          setKgConsumed(String(row.kg_consumed));
          setNotes(row.notes ?? '');
        } else {
          setKgConsumed('');
          setNotes('');
        }
      } catch (e) {
        console.error('Error loading monthly feed declaration:', e);
        if (!cancelled) {
          setExisting(null);
          setError(formatUnknownError(e, 'No se pudo cargar la declaración existente.'));
        }
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, yearNum, monthNum, scopeGallineroId]);

  const persist = async () => {
    const conflict = feedConsumptionScopeConflict(scopeGallineroId, monthDeclarations, existing?.id);
    if (conflict) {
      setError(conflict);
      return;
    }

    const kg = parseFloat(kgConsumed.replace(',', '.'));
    if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
      setError('Elegí un mes y año válidos.');
      return;
    }
    if (!Number.isFinite(kg) || kg < 0) {
      setError('Indicá los kg consumidos del mes (número válido).');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const gallineroParam = scopeGallineroId === FARM_SCOPE ? null : scopeGallineroId;
      const saved = await feedConsumptionMonthlyService.upsert(
        organizationId,
        yearNum,
        monthNum,
        kg,
        notes.trim() || null,
        gallineroParam,
        scopeHens > 0 ? scopeHens : null
      );
      await reloadMonthDeclarations();
      setCurrentMonthWarningOpen(false);
      await onSaved(saved);
      onClose();
    } catch (e) {
      console.error('Error saving monthly feed declaration:', e);
      setError(formatUnknownError(e, 'No se pudo guardar la declaración de consumo.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scopeConflict) {
      setError(scopeConflict);
      return;
    }
    if (isCurrentCalendarMonth(yearNum, monthNum)) {
      setCurrentMonthWarningOpen(true);
      return;
    }
    await persist();
  };

  const handleDelete = async () => {
    if (!existing || !organizationId) return;
    const scopeName =
      existing.gallinero_id == null
        ? 'Toda la granja'
        : gallineroNameById.get(existing.gallinero_id) ?? 'este gallinero';
    if (
      !window.confirm(
        `¿Eliminar la declaración de ${scopeName} (${periodLabel}, ${Number(existing.kg_consumed).toFixed(1)} kg)?`
      )
    ) {
      return;
    }
    try {
      setDeleting(true);
      setError('');
      await feedConsumptionMonthlyService.delete(organizationId, existing.id);
      setExisting(null);
      setKgConsumed('');
      setNotes('');
      await reloadMonthDeclarations();
      await onDeleted?.();
    } catch (e) {
      console.error('Error deleting feed consumption:', e);
      setError(formatUnknownError(e, 'No se pudo eliminar la declaración.'));
    } finally {
      setDeleting(false);
    }
  };

  const displayError = scopeConflict ?? error;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={existing ? 'Editar consumo del mes' : 'Declarar consumo del mes'}
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Vas a declarar el consumo de <strong>{periodLabel}</strong>
            {existing ? ' (ya hay una declaración: se actualizará).' : '.'}
          </div>

          <p className="text-sm text-gray-600">
            Declara el consumo total del MES COMPLETO. Si el mes todavía no terminó, esperá a tener
            el dato final antes de cargarlo, o cargalo apenas termine el mes.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Año"
              options={yearOptions}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <Select
              label="Mes"
              options={MONTH_OPTIONS}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          <Select
            label="Alcance"
            options={scopeOptions}
            value={scopeGallineroId}
            onChange={(e) => {
              setScopeGallineroId(e.target.value);
              setError('');
            }}
            disabled={loadingExisting || saving}
          />

          <p className="text-sm text-gray-600">
            Alcance: <strong>{scopeLabel}</strong>
            {scopeHens > 0 ? ` · ${scopeHens} aves activas` : ''}
          </p>

          {scopeConflict ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {scopeConflict}
            </div>
          ) : null}

          {monthDeclarations.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              <p className="font-medium text-slate-900">Declaraciones de {periodLabel}</p>
              <ul className="mt-2 space-y-1">
                {monthDeclarations.map((row) => {
                  const label =
                    row.gallinero_id == null
                      ? 'Toda la granja'
                      : gallineroNameById.get(row.gallinero_id) ?? 'Gallinero';
                  const isCurrent =
                    (row.gallinero_id == null && scopeGallineroId === FARM_SCOPE) ||
                    row.gallinero_id === scopeGallineroId;
                  return (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong>{label}</strong> · {Number(row.kg_consumed).toFixed(1)} kg
                        {isCurrent ? ' (actual)' : ''}
                      </span>
                      {!isCurrent ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-blue-700 underline"
                          onClick={() => {
                            setScopeGallineroId(row.gallinero_id ?? FARM_SCOPE);
                            setError('');
                          }}
                          disabled={loadingExisting || saving || deleting}
                        >
                          Ver / editar
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <Input
            label="Kg consumidos en el mes"
            type="number"
            step="0.01"
            min="0"
            value={kgConsumed}
            onChange={(e) => setKgConsumed(e.target.value)}
            disabled={loadingExisting || saving || Boolean(scopeConflict)}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              disabled={saving || Boolean(scopeConflict)}
            />
          </div>

          {displayError && !scopeConflict ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {displayError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex gap-2">
              <Button
                variant="primary"
                type="submit"
                className="flex-1"
                disabled={saving || loadingExisting || deleting || Boolean(scopeConflict)}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                className="flex-1"
                disabled={saving || deleting}
              >
                Cancelar
              </Button>
            </div>
            {existing ? (
              <Button
                variant="danger"
                type="button"
                className="w-full"
                disabled={saving || loadingExisting || deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? 'Eliminando…' : 'Eliminar esta declaración'}
              </Button>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={currentMonthWarningOpen}
        onClose={() => setCurrentMonthWarningOpen(false)}
        title="Mes todavía en curso"
        overlayClassName="z-[60]"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Estás declarando el consumo de <strong>{periodLabel}</strong>, que todavía no terminó.
            Este dato puede quedar incompleto. ¿Confirmás que es el total final, o preferís esperar
            a fin de mes?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              disabled={saving || Boolean(scopeConflict)}
              onClick={() => void persist()}
            >
              {saving ? 'Guardando…' : 'Confirmar y guardar'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={saving}
              onClick={() => setCurrentMonthWarningOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
