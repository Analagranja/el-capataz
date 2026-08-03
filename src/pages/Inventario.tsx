import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { inventoryStockService } from '../services/inventoryStock';
import type {
  EggInventorySnapshot,
  FeedInventorySnapshot,
  MapleInventorySnapshot,
} from '../services/inventoryStock';
import {
  EGG_STOCK_LABELS,
  MAPLE_STOCK_LABELS,
  formatFeedReachFromToday,
  formatUnknownError,
  type EggStockItemKey,
  type MapleStockItemKey,
} from '../services/inventoryStockCalc';
import { todayLocalYmd } from '../utils/monthToDateFinance';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import FeedConsumptionMissingReminder from '../components/FeedConsumptionMissingReminder';
import { ClipboardList, Package, Wallet } from 'lucide-react';

function formatQty(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  if (decimals === 0 && Number.isInteger(value)) return String(value);
  return value.toFixed(decimals);
}

function formatBaselineDate(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('es-AR');
}

type InventarioProps = {
  onNavigateToFeedConsumption?: (target: { year: number; month: number }) => void;
};

export default function Inventario({ onNavigateToFeedConsumption }: InventarioProps) {
  const { organizationId, user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [eggs, setEggs] = React.useState<EggInventorySnapshot | null>(null);
  const [feed, setFeed] = React.useState<FeedInventorySnapshot | null>(null);
  const [maples, setMaples] = React.useState<MapleInventorySnapshot | null>(null);

  const [baselineOpen, setBaselineOpen] = React.useState(false);
  const [baselineSaving, setBaselineSaving] = React.useState(false);
  const [baselineError, setBaselineError] = React.useState('');
  const [baselineForm, setBaselineForm] = React.useState({
    maple: '0',
    docena: '0',
    media_docena: '0',
  });

  const load = React.useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const board = await inventoryStockService.loadBoard(organizationId);
      setEggs(board.eggs);
      setFeed(board.feed);
      setMaples(board.maples);
    } catch (e) {
      console.error('Error loading inventory board:', e);
      setError('No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const openBaselineModal = () => {
    const src = maples?.baseline?.byItem ?? maples?.byItem;
    const nonNeg = (n: number | undefined) => String(Math.max(0, Math.floor(Number(n) || 0)));
    setBaselineForm({
      maple: nonNeg(src?.maple),
      docena: nonNeg(src?.docena),
      media_docena: nonNeg(src?.media_docena),
    });
    setBaselineError('');
    setBaselineOpen(true);
  };

  const handleSaveBaseline = async () => {
    if (!organizationId) return;
    const maple = parseInt(baselineForm.maple, 10);
    const docena = parseInt(baselineForm.docena, 10);
    const media_docena = parseInt(baselineForm.media_docena, 10);
    if (![maple, docena, media_docena].every((n) => Number.isFinite(n) && n >= 0)) {
      setBaselineError('Ingresá cantidades enteras mayores o iguales a 0.');
      return;
    }
    setBaselineSaving(true);
    setBaselineError('');
    try {
      await inventoryStockService.savePackagingBaseline(organizationId, user?.id ?? null, {
        baselineDate: todayLocalYmd(),
        maple,
        docena,
        media_docena,
      });
      setBaselineOpen(false);
      await load();
    } catch (e) {
      console.error('Error saving packaging baseline:', e);
      setBaselineError(formatUnknownError(e, 'No se pudo guardar la apertura.'));
    } finally {
      setBaselineSaving(false);
    }
  };

  const eggKeys: EggStockItemKey[] = ['grande', 'mediano', 'chico', 'sin_clasificar'];
  const mapleKeys: MapleStockItemKey[] = ['maple', 'docena', 'media_docena'];
  const hasNegativeMaples =
    maples != null && mapleKeys.some((k) => (maples.byItem[k] ?? 0) < 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Beta
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Stock actual = entradas − salidas (automático, sin conteo diario).
        </p>
      </div>

      {onNavigateToFeedConsumption ? (
        <FeedConsumptionMissingReminder onGoToDeclare={onNavigateToFeedConsumption} />
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando inventario…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-gray-800">
              <ClipboardList className="h-5 w-5 text-amber-700" aria-hidden />
              <h2 className="text-lg font-semibold">Huevos en depósito</h2>
            </div>
            <p className="text-3xl font-bold tabular-nums text-gray-900">
              {formatQty(eggs?.total ?? 0)}
              <span className="ml-2 text-base font-medium text-gray-500">huevos</span>
            </p>
            <ul className="space-y-1.5 text-sm text-gray-700">
              {eggKeys.map((key) => (
                <li key={key} className="flex justify-between border-b border-gray-100 pb-1">
                  <span>{EGG_STOCK_LABELS[key]}</span>
                  <span className="tabular-nums font-medium">{formatQty(eggs?.bySize[key] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-gray-800">
              <Wallet className="h-5 w-5 text-lime-700" aria-hidden />
              <h2 className="text-lg font-semibold">Alimento balanceado</h2>
            </div>
            <p className="text-3xl font-bold tabular-nums text-gray-900">
              {formatQty(feed?.stockKg ?? 0, 2)}
              <span className="ml-2 text-base font-medium text-gray-500">kg</span>
            </p>
            <p className="text-xs text-gray-600 tabular-nums">
              Compras {formatQty(feed?.purchasedKg ?? 0, 2)} kg − Consumo declarado{' '}
              {formatQty(feed?.consumedKg ?? 0, 2)} kg
            </p>
            <p className="text-sm text-gray-700">
              {feed?.daysRemaining == null ? (
                <>
                  Alcance estimado:{' '}
                  <span className="font-semibold">
                    {feed?.activeHens === 0 ? 'Sin aves activas' : 'Sin datos'}
                  </span>
                </>
              ) : (
                (() => {
                  const { daysLabel, untilLabel } = formatFeedReachFromToday(feed.daysRemaining);
                  return (
                    <>
                      Al ritmo actual, con el stock de hoy te alcanza aproximadamente{' '}
                      <span className="font-semibold tabular-nums">{daysLabel} días</span>
                      {' '}(hasta el {untilLabel} aprox.)
                    </>
                  );
                })()
              )}
            </p>
            {feed != null && feed.gramsPerHenDay > 0 ? (
              <p className="text-xs text-gray-500">
                Base {feed.gramsPerHenDay.toFixed(0)} g/ave/día
                {feed.gramsSource === 'default' ? ' (referencia)' : ' (meses cerrados)'}
                {feed.activeHens > 0 ? ` · ${feed.activeHens} aves` : ''}
              </p>
            ) : null}
            <p className="text-xs text-gray-500">
              Entradas: compras en Gastos (Alimento). Salidas: consumo mensual declarado.
            </p>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-gray-800">
              <Package className="h-5 w-5 text-sky-700" aria-hidden />
              <h2 className="text-lg font-semibold">Maples vacíos</h2>
            </div>
            {hasNegativeMaples && !maples?.baseline ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Stock negativo: faltan compras históricas con cantidad, o conviene declarar el stock
                físico actual como apertura.
              </p>
            ) : null}
            <ul className="space-y-2 text-sm text-gray-700">
              {mapleKeys.map((key) => (
                <li key={key} className="flex justify-between border-b border-gray-100 pb-2">
                  <span>{MAPLE_STOCK_LABELS[key]}</span>
                  <span
                    className={`text-xl font-bold tabular-nums ${
                      (maples?.byItem[key] ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    {formatQty(maples?.byItem[key] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500">
              {maples?.baseline
                ? `Línea base del ${formatBaselineDate(maples.baseline.baselineDate)} + compras − ventas desde esa fecha.`
                : 'Entradas: gastos Maples / Packaging con cantidad. Salidas: ventas por formato.'}
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={openBaselineModal}>
              {maples?.baseline ? 'Actualizar stock inicial' : 'Declarar stock inicial'}
            </Button>
          </Card>
        </div>
      )}

      <Modal
        isOpen={baselineOpen}
        onClose={() => !baselineSaving && setBaselineOpen(false)}
        title={maples?.baseline ? 'Actualizar stock inicial de packaging' : 'Declarar stock inicial de packaging'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Ingresá el stock físico que tenés hoy. Esto reemplaza el saldo histórico de packaging; de
            acá en más el inventario suma compras (Gastos) y resta ventas automáticamente.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {mapleKeys.map((key) => (
              <Input
                key={key}
                label={MAPLE_STOCK_LABELS[key]}
                type="number"
                min="0"
                step="1"
                value={baselineForm[key]}
                onChange={(e) => setBaselineForm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            ))}
          </div>
          {baselineError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {baselineError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={baselineSaving}
              onClick={() => setBaselineOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={baselineSaving} onClick={() => void handleSaveBaseline()}>
              {baselineSaving ? 'Guardando…' : 'Guardar apertura'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
