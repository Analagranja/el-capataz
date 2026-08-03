import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { inventoryStockService } from '../services/inventoryStock';
import type {
  EggInventorySnapshot,
  FeedInventorySnapshot,
  MapleInventorySnapshot,
} from '../services/inventoryStock';
import { EGG_STOCK_LABELS, MAPLE_STOCK_LABELS, formatFeedReachFromToday, type EggStockItemKey } from '../services/inventoryStockCalc';
import Card from '../components/ui/Card';
import FeedConsumptionMissingReminder from '../components/FeedConsumptionMissingReminder';
import { ClipboardList, Package, Wallet } from 'lucide-react';

function formatQty(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  if (decimals === 0 && Number.isInteger(value)) return String(value);
  return value.toFixed(decimals);
}

type InventarioProps = {
  onNavigateToFeedConsumption?: (target: { year: number; month: number }) => void;
};

export default function Inventario({ onNavigateToFeedConsumption }: InventarioProps) {
  const { organizationId } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [eggs, setEggs] = React.useState<EggInventorySnapshot | null>(null);
  const [feed, setFeed] = React.useState<FeedInventorySnapshot | null>(null);
  const [maples, setMaples] = React.useState<MapleInventorySnapshot | null>(null);

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

  const eggKeys: EggStockItemKey[] = ['grande', 'mediano', 'chico', 'sin_clasificar'];

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
          Stock actual = entradas − salidas (automático, sin conteo manual).
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
            <ul className="space-y-2 text-sm text-gray-700">
              {(['maple', 'docena', 'media_docena'] as const).map((key) => (
                <li key={key} className="flex justify-between border-b border-gray-100 pb-2">
                  <span>{MAPLE_STOCK_LABELS[key]}</span>
                  <span className="text-xl font-bold tabular-nums text-gray-900">
                    {formatQty(maples?.byItem[key] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500">
              Entradas: gastos Maples / Packaging con cantidad. Salidas: ventas por formato.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
