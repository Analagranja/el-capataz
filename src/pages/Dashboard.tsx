import React from 'react';
import { Event, EventType, Expense, Gallinero, ProductionRecord, Sale } from '../types';
import { gallinerosService } from '../services/gallineros';
import { productionService, computeLayingPercentage } from '../services/production';
import { salesService } from '../services/sales';
import { eventsService } from '../services/events';
import { expensesService } from '../services/expenses';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardMetricsTick } from '../contexts/DashboardMetricsRefreshContext';
import { useRole } from '../hooks/useRole';
import { computeMonthToDateTotals, currentMonthStartLocalYmd, todayLocalYmd } from '../utils/monthToDateFinance';
import { formatArs } from '../utils/formatCurrency';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

interface DashboardProps {
  selectedGallineroId: string | null;
}

const SANIDAD_TYPE_LABEL: Partial<Record<EventType, string>> = {
  vacunacion: 'Vacunación',
  vitaminas: 'Vitaminas',
  medicacion: 'Medicación',
};

/** Días hasta reminder_date (YYYY-MM-DD); ≤0 = hoy o vencido. */
function calendarDaysUntilReminder(reminderDate: string): number {
  const raw = reminderDate.slice(0, 10);
  const [y, m, day] = raw.split('-').map((n) => Number(n));
  if (!y || !m || !day) return 999;
  const target = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatSanidadReminderDate(reminderDate: string): string {
  const raw = reminderDate.slice(0, 10);
  const [y, m, day] = raw.split('-').map((n) => Number(n));
  if (!y || !m || !day) return raw;
  return new Date(y, m - 1, day).toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function displayNameForSanidad(ev: Event): string {
  const d = ev.description?.trim();
  if (d) return d;
  return SANIDAD_TYPE_LABEL[ev.event_type] ?? 'Tratamiento';
}

export default function Dashboard({ selectedGallineroId: _selectedGallineroId }: DashboardProps) {
  const { organizationId } = useAuth();
  const { isOperator } = useRole();
  const dashboardTick = useDashboardMetricsTick();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [productionMonth, setProductionMonth] = React.useState<ProductionRecord[]>([]);
  const [production, setProduction] = React.useState<ProductionRecord[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [sanidadReminder, setSanidadReminder] = React.useState<Event | null>(null);
  const [markingSanidadDone, setMarkingSanidadDone] = React.useState(false);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!organizationId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const monthStartYmd = currentMonthStartLocalYmd();
        const todayYmd = todayLocalYmd();
        const [gallinerosData, productionMonthData, productionRecentData, salesMonthData, expensesMonthData, nextSanidad] =
          await Promise.all([
            gallinerosService.getAll(organizationId),
            productionService.getAllRange(organizationId, monthStartYmd, todayYmd),
            productionService.getAll(organizationId, 30),
            salesService.getAllRange(organizationId, monthStartYmd, todayYmd),
            expensesService.getAllRange(organizationId, monthStartYmd, todayYmd),
            eventsService.getNextSanidadReminder(organizationId),
          ]);

        setGallineros(gallinerosData);
        setProductionMonth(productionMonthData);
        setProduction(productionRecentData);
        setSales(salesMonthData);
        setExpenses(expensesMonthData);
        setSanidadReminder(nextSanidad);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [organizationId, dashboardTick]);

  const handleMarkSanidadDone = async () => {
    if (!organizationId || !sanidadReminder) return;
    setMarkingSanidadDone(true);
    try {
      await eventsService.markReminderCompleted(organizationId, sanidadReminder.id);
      const next = await eventsService.getNextSanidadReminder(organizationId);
      setSanidadReminder(next);
    } catch (error) {
      console.error('Error al marcar recordatorio:', error);
    } finally {
      setMarkingSanidadDone(false);
    }
  };

  const totalGallinas = gallineros.reduce((sum, g) => sum + g.current_count, 0);
  const totalCapacity = gallineros.reduce((sum, g) => sum + g.capacity, 0);

  const monthStart = currentMonthStartLocalYmd();
  const todayYmd = todayLocalYmd();
  const { gananciaDelMes } = computeMonthToDateTotals(sales, expenses, monthStart, todayYmd);

  const getLayingPercentageForRecord = (p: ProductionRecord) => {
    const hens =
      (p.poultry_count && p.poultry_count > 0
        ? p.poultry_count
        : gallineros.find((g) => g.id === p.gallinero_id)?.current_count) ?? 0;
    return computeLayingPercentage(p.eggs_count, hens);
  };

  const monthEggsTotal = productionMonth.reduce((sum, p) => sum + p.eggs_count, 0);

  const monthLabel = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const avgLayingPercentage =
    production.length > 0
      ? production.reduce((sum, p) => sum + getLayingPercentageForRecord(p), 0) / production.length
      : 0;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm font-medium tracking-wide text-slate-400">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 sm:space-y-10">
      <header className="space-y-2 px-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">El Capataz</p>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Panel</h2>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          Resumen rápido de tu granja
        </p>
      </header>

      <Card
        padding="none"
        className={
          sanidadReminder && sanidadReminder.reminder_date
            ? calendarDaysUntilReminder(sanidadReminder.reminder_date) <= 2
              ? '!overflow-hidden !rounded-3xl border-2 border-rose-300/80 !bg-gradient-to-br from-rose-50 via-orange-50/50 to-amber-50 !shadow-xl !shadow-rose-200/40'
              : '!overflow-hidden !rounded-3xl border border-teal-200/60 !bg-gradient-to-br from-teal-50 via-cyan-50/40 to-sky-50 !shadow-lg !shadow-teal-200/30'
            : '!overflow-hidden !rounded-3xl border border-slate-200/60 !bg-gradient-to-br from-slate-50 to-violet-50/30 !shadow-md !shadow-slate-200/30'
        }
      >
        <div className="flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:py-7">
          <div className="flex min-w-0 gap-4">
            <span
              className={`flex h-16 w-16 shrink-0 select-none items-center justify-center rounded-3xl bg-white/80 text-[2.5rem] leading-none shadow-inner antialiased ring-1 ring-white/90 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-[2.75rem] ${
                sanidadReminder && sanidadReminder.reminder_date
                  ? calendarDaysUntilReminder(sanidadReminder.reminder_date) <= 2
                    ? 'ring-rose-200/80'
                    : 'ring-teal-200/80'
                  : 'ring-slate-200/60'
              }`}
              role="img"
              aria-label="Sanidad"
            >
              💉
            </span>
            <div className="min-w-0 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Alertas sanitarias</h3>
              {sanidadReminder && sanidadReminder.reminder_date ? (
                <p
                  className={`text-sm leading-relaxed sm:text-base ${
                    calendarDaysUntilReminder(sanidadReminder.reminder_date) <= 2
                      ? 'font-medium text-rose-900'
                      : 'text-slate-800'
                  }`}
                >
                  Próxima Vacuna/Tratamiento: {displayNameForSanidad(sanidadReminder)} - Fecha:{' '}
                  {formatSanidadReminderDate(sanidadReminder.reminder_date)}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-slate-500">
                  No hay recordatorios pendientes. En Eventos podés registrar vacunación, vitaminas o medicación e
                  indicar la fecha de la próxima aplicación.
                </p>
              )}
            </div>
          </div>
          {sanidadReminder && sanidadReminder.reminder_date ? (
            <Button
              type="button"
              variant="success"
              size="sm"
              className="shrink-0 self-stretch rounded-2xl px-5 py-2.5 shadow-md sm:self-center"
              disabled={markingSanidadDone}
              onClick={handleMarkSanidadDone}
            >
              {markingSanidadDone ? 'Guardando…' : 'Marcar como realizado'}
            </Button>
          ) : null}
        </div>
      </Card>

      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${isOperator ? 'lg:grid-cols-2' : 'lg:grid-cols-4'}`}>
        <Card
          padding="none"
          hover
          className="!overflow-hidden !rounded-3xl !border-0 !bg-gradient-to-br from-sky-100/90 via-indigo-50 to-violet-100/50 !shadow-lg !shadow-indigo-200/25 ring-1 ring-white/70"
        >
          <div className="flex min-h-[148px] flex-col gap-4 p-5 sm:min-h-[160px] sm:p-6">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                Total de aves
              </p>
              <span
                className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-2xl bg-white/75 text-[2.5rem] leading-none shadow-sm antialiased ring-1 ring-white sm:h-16 sm:w-16 sm:text-[2.75rem]"
                role="img"
                aria-label="Gallinas"
              >
                🐔
              </span>
            </div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
              {totalGallinas}
            </p>
            <p className="mt-auto text-[11px] text-slate-500 sm:text-xs">de {totalCapacity} capacidad</p>
          </div>
        </Card>

        <Card
          padding="none"
          hover
          className="!overflow-hidden !rounded-3xl !border-0 !bg-gradient-to-br from-emerald-100/80 via-teal-50 to-cyan-100/40 !shadow-lg !shadow-emerald-200/30 ring-1 ring-white/70"
        >
          <div className="flex min-h-[148px] flex-col gap-4 p-5 sm:min-h-[160px] sm:p-6">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                Producción del mes
              </p>
              <span
                className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-2xl bg-white/75 text-[2.5rem] leading-none shadow-sm antialiased ring-1 ring-white sm:h-16 sm:w-16 sm:text-[2.75rem]"
                role="img"
                aria-label="Huevos"
              >
                🥚
              </span>
            </div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
              {monthEggsTotal}
            </p>
            <p className="mt-auto text-[11px] text-slate-500 sm:text-xs">
              Suma del 1 al {Number(todayYmd.slice(8, 10))} · {monthLabel}
            </p>
          </div>
        </Card>

        {!isOperator && (
          <Card
            padding="none"
            hover
            className="!overflow-hidden !rounded-3xl !border-0 !bg-gradient-to-br from-amber-100/80 via-orange-50 to-rose-100/30 !shadow-lg !shadow-amber-200/25 ring-1 ring-white/70"
          >
            <div className="flex min-h-[148px] flex-col gap-4 p-5 sm:min-h-[160px] sm:p-6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Postura promedio
                </p>
                <span
                  className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-2xl bg-white/75 text-[2.5rem] leading-none shadow-sm antialiased ring-1 ring-white sm:h-16 sm:w-16 sm:text-[2.75rem]"
                  role="img"
                  aria-label="Tendencia"
                >
                  📈
                </span>
              </div>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
                {avgLayingPercentage.toFixed(1)}%
              </p>
              <p className="mt-auto text-[11px] text-slate-500 sm:text-xs">últimos 30 días</p>
            </div>
          </Card>
        )}

        {!isOperator && (
          <Card
            padding="none"
            hover
            className="!overflow-hidden !rounded-3xl !border-0 !bg-gradient-to-br from-fuchsia-100/70 via-violet-50 to-purple-100/50 !shadow-lg !shadow-violet-200/25 ring-1 ring-white/70"
          >
            <div className="flex min-h-[148px] flex-col gap-4 p-5 sm:min-h-[160px] sm:p-6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Ganancia del Mes
                </p>
                <span
                  className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-2xl bg-white/75 text-[2.5rem] leading-none shadow-sm antialiased ring-1 ring-white sm:h-16 sm:w-16 sm:text-[2.75rem]"
                  role="img"
                  aria-label="Dinero"
                >
                  💰
                </span>
              </div>
              <p
                className={`text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${
                  gananciaDelMes < 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {formatArs(gananciaDelMes)}
              </p>
              <p className="mt-auto text-[11px] text-slate-500 sm:text-xs">
                Ventas del 1 al {Number(todayYmd.slice(8, 10))} − gastos del mismo período · toda la granja · {monthLabel}
              </p>
            </div>
          </Card>
        )}

      </div>

      <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
        <Card
          padding="none"
          className="!overflow-hidden !rounded-3xl border-0 !bg-gradient-to-b from-slate-50/90 to-white !shadow-xl !shadow-slate-200/40 ring-1 ring-slate-200/50"
        >
          <div className="border-b border-violet-100/80 bg-gradient-to-r from-violet-50/80 to-indigo-50/40 px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center gap-3">
              <span className="select-none text-[1.625rem] leading-none antialiased" aria-hidden>
                🏠
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Gallineros</h3>
                <p className="text-xs text-slate-500">Estado por gallinero</p>
              </div>
            </div>
          </div>
          <div className="space-y-2.5 p-4 sm:p-6">
            {gallineros.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100/90 bg-white/70 p-4 shadow-sm ring-1 ring-slate-100/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="h-4 w-4 shrink-0 rounded-full shadow-sm ring-2 ring-white"
                    style={{ backgroundColor: g.color }}
                  />
                  <span className="truncate font-medium text-slate-900">{g.name}</span>
                </div>
                <span className="shrink-0 tabular-nums text-sm font-medium text-slate-600">{g.current_count} aves</span>
              </div>
            ))}
          </div>
        </Card>

        <Card
          padding="none"
          className="!overflow-hidden !rounded-3xl border-0 !bg-gradient-to-b from-emerald-50/50 to-white !shadow-xl !shadow-emerald-200/30 ring-1 ring-emerald-100/60"
        >
          <div className="border-b border-emerald-100/80 bg-gradient-to-r from-emerald-50/90 to-teal-50/50 px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center gap-3">
              <span className="select-none text-[1.625rem] leading-none antialiased" aria-hidden>
                📋
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Resumen últimos días</h3>
                <p className="text-xs text-slate-500">Producción reciente</p>
              </div>
            </div>
          </div>
          <div className="space-y-2.5 p-4 sm:p-6">
            {production.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100/70 bg-gradient-to-r from-emerald-50/50 to-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{p.date}</p>
                  <p className="text-sm text-slate-600">{p.eggs_count} huevos</p>
                </div>
                <span className="shrink-0 tabular-nums text-sm font-semibold text-emerald-700">
                  {getLayingPercentageForRecord(p).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
