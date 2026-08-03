import React from 'react';
import { FeedConsumptionMonthly } from '../types';
import { feedConsumptionMonthlyService } from '../services/feedConsumptionMonthly';
import { formatUnknownError } from '../services/inventoryStockCalc';
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
  /** Aves activas de toda la granja (snapshot al guardar). */
  activeHens: number;
  /** Si vienen de un recordatorio, preseleccionar ese período. */
  initialYear?: number;
  initialMonth?: number;
  onSaved: (saved: FeedConsumptionMonthly) => void | Promise<void>;
};

export default function DeclareMonthlyFeedModal({
  isOpen,
  onClose,
  organizationId,
  activeHens,
  initialYear,
  initialMonth,
  onSaved,
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
  const [year, setYear] = React.useState(defaults.year);
  const [month, setMonth] = React.useState(defaults.month);
  const [kgConsumed, setKgConsumed] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [existing, setExisting] = React.useState<FeedConsumptionMonthly | null>(null);
  const [loadingExisting, setLoadingExisting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [currentMonthWarningOpen, setCurrentMonthWarningOpen] = React.useState(false);

  const yearOptions = React.useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 4 }, (_, i) => {
      const value = String(y - i);
      return { value, label: value };
    });
  }, [now]);

  const yearNum = Number(year);
  const monthNum = Number(month);
  const periodLabel =
    Number.isFinite(yearNum) && Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12
      ? `${MONTH_LABELS[monthNum - 1]} ${yearNum}`
      : '—';

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
    setKgConsumed('');
    setNotes('');
    setExisting(null);
    setError('');
    setCurrentMonthWarningOpen(false);
  }, [initialYear, initialMonth]);

  React.useEffect(() => {
    if (!isOpen) return;
    resetFormForOpen();
  }, [isOpen, resetFormForOpen]);

  React.useEffect(() => {
    if (!isOpen || !organizationId) return;
    if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum)) return;
    let cancelled = false;
    (async () => {
      setLoadingExisting(true);
      try {
        const row = await feedConsumptionMonthlyService.getByPeriod(
          organizationId,
          yearNum,
          monthNum,
          null
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
  }, [isOpen, organizationId, yearNum, monthNum]);

  const persist = async () => {
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
      const saved = await feedConsumptionMonthlyService.upsert(
        organizationId,
        yearNum,
        monthNum,
        kg,
        notes.trim() || null,
        null,
        activeHens > 0 ? activeHens : null
      );
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
    if (isCurrentCalendarMonth(yearNum, monthNum)) {
      setCurrentMonthWarningOpen(true);
      return;
    }
    await persist();
  };

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

          <p className="text-sm text-gray-600">
            Alcance: <strong>Toda la granja</strong>
            {activeHens > 0 ? ` · ${activeHens} aves activas` : ''}
          </p>

          <Input
            label="Kg consumidos en el mes"
            type="number"
            step="0.01"
            min="0"
            value={kgConsumed}
            onChange={(e) => setKgConsumed(e.target.value)}
            disabled={loadingExisting || saving}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              disabled={saving}
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button variant="primary" type="submit" className="flex-1" disabled={saving || loadingExisting}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="secondary" type="button" onClick={onClose} className="flex-1" disabled={saving}>
              Cancelar
            </Button>
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
              disabled={saving}
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
