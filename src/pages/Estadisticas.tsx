import React from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ProductionRecord, Sale, Event, Gallinero, Expense, FeedLog, FeedConsumptionMonthly } from '../types';
import { productionService, computeLayingPercentage } from '../services/production';
import { salesService } from '../services/sales';
import { eventsService } from '../services/events';
import { gallinerosService } from '../services/gallineros';
import { expensesService } from '../services/expenses';
import { feedLogsService } from '../services/feedLogs';
import { feedConsumptionMonthlyService } from '../services/feedConsumptionMonthly';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { Download } from 'lucide-react';
import { downloadSalesAndProductionExcel } from '../utils/exportFarmData';
import { computeMonthToDateTotals } from '../utils/monthToDateFinance';
import {
  boundsForYearMonthFilter,
  boundsForCalendarYear,
  inclusiveLocalDaysBetween,
  todayLocalYmdParts,
} from '../utils/statsPeriod';
import { formatArs } from '../utils/formatCurrency';

const EGGS_PER_SALE_TYPE: Record<Sale['type'], number> = {
  maple: 30,
  docena: 12,
  media_docena: 6,
  pack15: 15,
  maple_grande: 30,
  maple_mediano: 30,
  maple_chico: 30,
};

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
] as const;

export default function Estadisticas() {
  const { organizationId } = useAuth();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [production, setProduction] = React.useState<ProductionRecord[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [feedLogs, setFeedLogs] = React.useState<FeedLog[]>([]);
  const [summaryProduction, setSummaryProduction] = React.useState<ProductionRecord[]>([]);
  const [summarySales, setSummarySales] = React.useState<Sale[]>([]);
  const [summaryExpenses, setSummaryExpenses] = React.useState<Expense[]>([]);
  const [summaryConsumptions, setSummaryConsumptions] = React.useState<FeedConsumptionMonthly[]>([]);
  const [feedConsumption, setFeedConsumption] = React.useState<FeedConsumptionMonthly | null>(null);
  const [feedConsumptionLoading, setFeedConsumptionLoading] = React.useState(false);
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState('');
  const [selectedYear, setSelectedYear] = React.useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedGallinero, setSelectedGallinero] = React.useState('');
  const [summaryYear, setSummaryYear] = React.useState<string>(new Date().getFullYear().toString());

  const loadGallineros = async () => {
    if (!organizationId) return;
    try {
      const data = await gallinerosService.getAll(organizationId);
      setGallineros(data);
    } catch (error) {
      console.error('Error loading gallineros:', error);
    }
  };

  const loadData = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const y = Number(selectedYear);
      const { y: cy, ymd: todayY } = todayLocalYmdParts();
      let fromY = `${y}-01-01`;
      let toY: string;
      if (y > cy) {
        toY = `${y}-01-01`;
      } else if (y < cy) {
        toY = `${y}-12-31`;
      } else {
        toY = todayY;
      }

      const [productionData, salesData, expensesData, eventsData, feedLogsData] = await Promise.all([
        productionService.getAllRange(organizationId, fromY, toY),
        salesService.getAllRange(organizationId, fromY, toY),
        expensesService.getAllRange(organizationId, fromY, toY),
        eventsService.getAllRange(organizationId, fromY, toY),
        feedLogsService.getAllRange(organizationId, fromY, toY),
      ]);

      setProduction(productionData);
      setSales(salesData);
      setExpenses(expensesData);
      setEvents(eventsData);
      setFeedLogs(feedLogsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadGallineros();
  }, [organizationId]);

  React.useEffect(() => {
    loadData();
  }, [organizationId, selectedYear]);

  React.useEffect(() => {
    if (!organizationId || !selectedMonth) {
      setFeedConsumption(null);
      return;
    }
    let cancelled = false;
    setFeedConsumptionLoading(true);
    feedConsumptionMonthlyService
      .getByPeriod(
        organizationId,
        Number(selectedYear),
        Number(selectedMonth),
        selectedGallinero || null
      )
      .then((data) => {
        if (!cancelled) setFeedConsumption(data);
      })
      .catch(() => {
        if (!cancelled) setFeedConsumption(null);
      })
      .finally(() => {
        if (!cancelled) setFeedConsumptionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedYear, selectedMonth, selectedGallinero]);

  React.useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const sy = Number(summaryYear);
      if (!Number.isFinite(sy)) return;
      try {
        setSummaryLoading(true);
        const { fromYmd, toYmd } = boundsForCalendarYear(sy);
        const [prod, saleRows, expRows, consumptionRows] = await Promise.all([
          productionService.getAllRange(organizationId, fromYmd, toYmd),
          salesService.getAllRange(organizationId, fromYmd, toYmd),
          expensesService.getAllRange(organizationId, fromYmd, toYmd),
          feedConsumptionMonthlyService.getAllByYear(organizationId, sy),
        ]);
        if (!cancelled) {
          setSummaryProduction(prod);
          setSummarySales(saleRows);
          setSummaryExpenses(expRows);
          setSummaryConsumptions(consumptionRows);
        }
      } catch (error) {
        console.error('Error loading monthly summary:', error);
        if (!cancelled) {
          setSummaryProduction([]);
          setSummarySales([]);
          setSummaryExpenses([]);
          setSummaryConsumptions([]);
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, summaryYear]);

  const fallbackYearOptions = React.useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => String(y - i));
  }, []);

  const availableYears = Array.from(
    new Set([
      selectedYear,
      ...fallbackYearOptions,
      ...production.map((item) => item.date.split('-')[0]),
      ...sales.map((item) => item.date.split('-')[0]),
      ...expenses.map((item) => item.date.split('-')[0]),
      ...events.map((item) => item.date.split('-')[0]),
      ...feedLogs.map((item) => item.date.split('-')[0]),
    ])
  )
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const activeYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] || selectedYear;
  const yearOptions = availableYears.map((year) => ({ value: year, label: year }));

  const dateMatchesFilter = (dateString: string) => {
    const [year = '', month = ''] = dateString.split('-');
    const yearMatches = !activeYear || year === activeYear;
    const monthMatches = !selectedMonth || month === selectedMonth;
    return yearMatches && monthMatches;
  };

  const matchesGallineroFilter = (gallineroId: string) =>
    !selectedGallinero || gallineroId === selectedGallinero;

  const filteredProduction = production.filter(
    (p) => dateMatchesFilter(p.date) && matchesGallineroFilter(p.gallinero_id)
  );
  const filteredSales = sales.filter((s) => dateMatchesFilter(s.date));
  const filteredExpenses = expenses.filter((e) => dateMatchesFilter(e.date));

  const sumGallineroHens = (list: Gallinero[]) =>
    list.reduce(
      (sum, g) => sum + Math.max(0, Math.floor(Number(g.current_count) || 0)),
      0
    );

  /** Aves para postura y consumo/ave: gallinero filtrado o suma de toda la granja. */
  const totalFarmHens = selectedGallinero
    ? Math.max(
        0,
        Math.floor(
          Number(gallineros.find((g) => g.id === selectedGallinero)?.current_count) || 0
        )
      )
    : sumGallineroHens(gallineros);

  const eggsByDate = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of filteredProduction) {
      m.set(p.date, (m.get(p.date) ?? 0) + p.eggs_count);
    }
    return m;
  }, [filteredProduction]);

  const gallineroFilterOptions = [
    { value: '', label: 'Toda la granja' },
    ...gallineros.map((g) => ({ value: g.id, label: g.name })),
  ];

  const monthOptions = [
    { value: '', label: 'Todos los meses' },
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
  ];

  const summaryYearOptions = React.useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const year = String(y - i);
      return { value: year, label: year };
    });
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  const productionChartData = Array.from(eggsByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, huevos]) => ({
      date,
      huevos,
      postura: parseFloat(computeLayingPercentage(huevos, totalFarmHens).toFixed(1)),
    }));

  const salesByType = [
    {
      name: 'Maple',
      value: filteredSales.filter((s) => s.type === 'maple').reduce((sum, s) => sum + s.quantity, 0),
    },
    {
      name: 'Docena',
      value: filteredSales.filter((s) => s.type === 'docena').reduce((sum, s) => sum + s.quantity, 0),
    },
    {
      name: 'Media Docena',
      value: filteredSales.filter((s) => s.type === 'media_docena').reduce((sum, s) => sum + s.quantity, 0),
    },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const totalEggsProduced = filteredProduction.reduce((sum, p) => sum + p.eggs_count, 0);
  const dailyLayingPercentages = Array.from(eggsByDate.values()).map((eggs) =>
    computeLayingPercentage(eggs, totalFarmHens)
  );
  const avgLayingPercentage =
    dailyLayingPercentages.length > 0
      ? dailyLayingPercentages.reduce((sum, pct) => sum + pct, 0) / dailyLayingPercentages.length
      : 0;
  const totalEggsSold = filteredSales.reduce((sum, sale) => {
    const eggsByType = EGGS_PER_SALE_TYPE[sale.type] || 0;
    return sum + sale.quantity * eggsByType;
  }, 0);
  const totalSalesAmount = filteredSales.reduce((sum, s) => sum + s.total_price, 0);
  const avgPricePerEgg = totalEggsSold > 0 ? totalSalesAmount / totalEggsSold : 0;
  const periodBounds = boundsForYearMonthFilter(activeYear, selectedMonth);
  const periodLabel = selectedMonth
    ? `${MONTH_NAMES[Number(selectedMonth) - 1]} ${activeYear}`
    : `Año ${activeYear}`;
  const periodFinance = computeMonthToDateTotals(
    filteredSales,
    filteredExpenses,
    periodBounds.fromYmd,
    periodBounds.toYmd
  );

  const totalVentasPeriodo = filteredSales.reduce((sum, s) => sum + s.total_price, 0);
  const gastosAlimentoPeriodo = filteredExpenses
    .filter((e) => e.description === 'Alimento')
    .reduce((sum, e) => sum + e.total_price, 0);
  const gastosOtrosPeriodo = filteredExpenses
    .filter((e) => e.description !== 'Alimento')
    .reduce((sum, e) => sum + e.total_price, 0);
  const totalEgresosPeriodo = gastosAlimentoPeriodo + gastosOtrosPeriodo;
  const resultadoPeriodo = totalVentasPeriodo - totalEgresosPeriodo;
  const margenPorHuevo = totalEggsSold > 0 ? resultadoPeriodo / totalEggsSold : null;
  const costoPorHuevo = totalEggsProduced > 0 ? totalEgresosPeriodo / totalEggsProduced : null;

  const declaredKg = feedConsumption?.kg_consumed ?? null;
  const declaredHens = feedConsumption?.hens_snapshot ?? null;
  const daysForCalc = selectedMonth
    ? new Date(Number(activeYear), Number(selectedMonth), 0).getDate()
    : periodBounds.dayCount;
  const hensForCalc = declaredHens ?? totalFarmHens;
  const gramsPerHenPerDay =
    declaredKg != null && declaredKg > 0 && daysForCalc > 0 && hensForCalc > 0
      ? (declaredKg * 1000) / (daysForCalc * hensForCalc)
      : null;

  const summaryCalendarYear = Number(summaryYear) || new Date().getFullYear();
  const padMonth = (n: number) => String(n).padStart(2, '0');
  const monthlySummaryRows = MONTH_NAMES.map((monthLabel, idx) => {
    const m = idx + 1;
    const prefix = `${summaryCalendarYear}-${padMonth(m)}`;
    const lastDay = new Date(summaryCalendarYear, m, 0).getDate();
    const fromYmd = `${summaryCalendarYear}-${padMonth(m)}-01`;
    const toYmd = `${summaryCalendarYear}-${padMonth(m)}-${padMonth(lastDay)}`;
    const daysInMonth = inclusiveLocalDaysBetween(fromYmd, toYmd);

    const prodM = summaryProduction.filter((p) => p.date.startsWith(prefix));
    const saleM = summarySales.filter((s) => s.date.startsWith(prefix));
    const expM = summaryExpenses.filter((e) => e.date.startsWith(prefix));
    const totalHuevosMes = prodM.reduce((sum, p) => sum + p.eggs_count, 0);
    const huevosVendidosMes = saleM.reduce((sum, s) => {
      const eggsByType = EGGS_PER_SALE_TYPE[s.type] || 0;
      return sum + s.quantity * eggsByType;
    }, 0);
    const netoMes = saleM.reduce((sum, s) => sum + (Number(s.total_price) || 0), 0);
    const gastosMes = expM.reduce((sum, e) => sum + (Number(e.total_price) || 0), 0);
    const gananciaMes = netoMes - gastosMes;
    const monthConsumption = summaryConsumptions.find((c) => c.month === m);
    const kgAlimento = monthConsumption
      ? Math.max(0, Number(monthConsumption.kg_consumed) || 0)
      : 0;

    const avgAvesMes =
      monthConsumption?.hens_snapshot != null && monthConsumption.hens_snapshot > 0
        ? monthConsumption.hens_snapshot
        : sumGallineroHens(gallineros);

    const gramsPerHenDay =
      kgAlimento > 0 && daysInMonth > 0 && avgAvesMes > 0
        ? (kgAlimento * 1000) / (daysInMonth * avgAvesMes)
        : null;

    return {
      monthLabel,
      totalHuevosMes,
      huevosVendidosMes,
      netoMes,
      gananciaMes,
      gastosMes,
      kgAlimento,
      gramsPerHenDay,
      daysInMonth,
      avgAvesMes,
    };
  });

  const totalHuevosAnual = monthlySummaryRows.reduce((sum, r) => sum + r.totalHuevosMes, 0);
  const totalVentasAnual = monthlySummaryRows.reduce((sum, r) => sum + r.netoMes, 0);
  const totalHuevosVendidosAnual = monthlySummaryRows.reduce((sum, r) => sum + r.huevosVendidosMes, 0);
  const totalGastosAnual = monthlySummaryRows.reduce((sum, r) => sum + r.gastosMes, 0);
  const totalKgAlimentoAnual = monthlySummaryRows.reduce((sum, r) => sum + r.kgAlimento, 0);
  const precioPromedioHuevoAnual =
    totalHuevosVendidosAnual > 0 ? totalVentasAnual / totalHuevosVendidosAnual : 0;

  let gramsAnualNumerator = 0;
  let gramsAnualDenominator = 0;
  for (const row of monthlySummaryRows) {
    if (row.kgAlimento > 0 && row.daysInMonth > 0 && row.avgAvesMes > 0) {
      gramsAnualNumerator += row.kgAlimento * 1000;
      gramsAnualDenominator += row.daysInMonth * row.avgAvesMes;
    }
  }
  const gramsPerHenDayAnual =
    gramsAnualDenominator > 0 ? gramsAnualNumerator / gramsAnualDenominator : null;

  const handleExportData = async () => {
    if (!organizationId) return;
    setExportError('');
    setExporting(true);
    try {
      const detail = boundsForYearMonthFilter(activeYear, selectedMonth);
      if (detail.fromYmd > detail.toYmd) {
        setExportError('No hay datos para exportar en el período seleccionado.');
        return;
      }

      const summary = boundsForYearMonthFilter(activeYear, '');

      const [
        saleRows,
        prodRows,
        expenseRows,
        saleSummaryRows,
        prodSummaryRows,
        expenseSummaryRows,
      ] = await Promise.all([
        salesService.getAllRange(organizationId, detail.fromYmd, detail.toYmd),
        productionService.getAllRange(organizationId, detail.fromYmd, detail.toYmd),
        expensesService.getAllRange(organizationId, detail.fromYmd, detail.toYmd),
        salesService.getAllRange(organizationId, summary.fromYmd, summary.toYmd),
        productionService.getAllRange(organizationId, summary.fromYmd, summary.toYmd),
        expensesService.getAllRange(organizationId, summary.fromYmd, summary.toYmd),
      ]);

      const gallineroNameById = new Map(gallineros.map((g) => [g.id, g.name]));
      downloadSalesAndProductionExcel({
        sales: saleRows,
        production: prodRows,
        expenses: expenseRows,
        summarySales: saleSummaryRows,
        summaryProduction: prodSummaryRows,
        summaryExpenses: expenseSummaryRows,
        summaryYear: activeYear,
        gallineroNameById,
        fromLabel: detail.fromYmd,
        toLabel: detail.toYmd,
      });
    } catch (err) {
      console.error('Export error:', err);
      setExportError('No se pudo exportar. Reintentá o revisá tu conexión.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold text-gray-900">Estadísticas</h2>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 self-start sm:self-auto"
          disabled={exporting || !organizationId}
          onClick={handleExportData}
        >
          <Download className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
          {exporting ? 'Exportando…' : 'Exportar Datos'}
        </Button>
      </div>
      {exportError ? <p className="text-sm text-red-600">{exportError}</p> : null}

      <Card padding="md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Gallinero"
            options={gallineroFilterOptions}
            value={selectedGallinero}
            onChange={(e) => setSelectedGallinero(e.target.value)}
          />
          <Select
            label="Año"
            options={yearOptions}
            value={activeYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          />
          <Select
            label="Mes"
            options={monthOptions}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>
      </Card>

      {productionChartData.length > 0 && (
        <Card padding="md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Producción Diaria</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={productionChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="huevos" stroke="#3b82f6" name="Huevos" />
              <Line yAxisId="right" type="monotone" dataKey="postura" stroke="#10b981" name="% Postura" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {salesByType.some((item) => item.value > 0) && (
        <Card padding="md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Ventas por Tipo</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={salesByType}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {salesByType.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card padding="md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Resumen Financiero — {periodLabel}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Ingresos (ventas)</span>
              <span className="font-semibold text-green-700">{formatArs(totalVentasPeriodo)}</span>
            </div>
            <div className="flex justify-between items-center py-1 pl-4">
              <span className="text-sm text-gray-600">Alimento</span>
              <span className="text-sm tabular-nums text-gray-800">
                {formatArs(gastosAlimentoPeriodo)}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 pl-4">
              <span className="text-sm text-gray-600">Otros gastos</span>
              <span className="text-sm tabular-nums text-gray-800">{formatArs(gastosOtrosPeriodo)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-700">Total egresos</span>
              <span className="font-semibold text-red-700">{formatArs(totalEgresosPeriodo)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-t-2 border-gray-300 bg-gray-50 rounded-lg px-3">
              <span className="font-semibold text-gray-900">Resultado</span>
              <span
                className={`text-xl font-bold ${
                  resultadoPeriodo >= 0 ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {formatArs(resultadoPeriodo)}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Por huevo</p>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Precio promedio de venta</span>
                <span className="font-medium tabular-nums">{formatArs(avgPricePerEgg)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Costo de producción</span>
                <span className="font-medium tabular-nums text-red-600">
                  {costoPorHuevo != null ? formatArs(costoPorHuevo) : '—'}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <span className="text-sm font-semibold text-gray-700">Margen por huevo</span>
                <span
                  className={`font-bold tabular-nums ${
                    margenPorHuevo != null && margenPorHuevo >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {margenPorHuevo != null ? formatArs(margenPorHuevo) : '—'}
                </span>
              </div>
            </div>
            {totalEgresosPeriodo === 0 && (
              <p className="text-xs text-gray-400">
                Cargá gastos del período para ver el análisis por huevo.
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Huevos puestos</p>
            <p className="text-2xl font-bold text-gray-900">{totalEggsProduced}</p>
            <p className="text-xs text-gray-500 mt-1">Total del período filtrado</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">% Postura Promedio</p>
            <p className="text-2xl font-bold text-gray-900">{avgLayingPercentage.toFixed(1)}%</p>
            <p className="text-xs text-gray-500 mt-1">Promedio diarios del período</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Huevos vendidos</p>
            <p className="text-2xl font-bold text-gray-900">{totalEggsSold}</p>
            <p className="text-xs text-gray-500 mt-1">Equivalente por tipo de venta</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Precio Promedio por Huevo</p>
            <p className="text-2xl font-bold text-gray-900">{formatArs(avgPricePerEgg)}</p>
            <p className="text-xs text-gray-500 mt-1">Sobre el período filtrado</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Ganancia</p>
            <p
              className={`text-2xl font-bold ${
                periodFinance.gananciaDelMes >= 0 ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {formatArs(periodFinance.gananciaDelMes)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Ingresos por ventas − gastos del período</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Consumo por ave/día</p>
            <p className="text-2xl font-bold text-gray-900">
              {gramsPerHenPerDay != null ? `${gramsPerHenPerDay.toFixed(1)} g/ave/día` : 'Sin datos'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {feedConsumptionLoading ? (
                <>Cargando consumo declarado…</>
              ) : gramsPerHenPerDay != null ? (
                <>
                  {declaredKg!.toFixed(2)} kg declarados · {daysForCalc} días · {hensForCalc} aves
                  {declaredHens ? ' (histórico)' : ' (actual)'}
                </>
              ) : selectedMonth ? (
                <>No hay consumo declarado para este mes.</>
              ) : (
                <>Seleccioná un mes para ver el consumo por ave/día.</>
              )}
            </p>
          </div>
        </Card>
      </div>

      <Card padding="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Resumen Mensual</h3>
            <p className="text-sm text-gray-600">
              Vista tipo planilla: totales por mes del año {summaryCalendarYear} (toda la
              organización).
            </p>
          </div>
          <div className="w-full sm:w-40 shrink-0">
            <Select
              label="Año"
              options={summaryYearOptions}
              value={summaryYear}
              onChange={(e) => setSummaryYear(e.target.value)}
            />
          </div>
        </div>
        {summaryLoading ? (
          <p className="text-sm text-gray-500">Cargando resumen…</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-3 py-2 font-semibold text-gray-700">Mes</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Total Huevos</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Huevos Vendidos</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Neto ($ ventas)</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Total ($ ganancia)</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Total Gastos ($)</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Kg Alimento</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">g/ave/día</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummaryRows.map((row) => (
                    <tr key={row.monthLabel} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{row.monthLabel}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-800">{row.totalHuevosMes}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-800">{row.huevosVendidosMes}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-800">{formatArs(row.netoMes)}</td>
                      <td
                        className={`px-3 py-2 tabular-nums font-medium ${
                          row.gananciaMes >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {formatArs(row.gananciaMes)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-800">{formatArs(row.gastosMes)}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-800">
                        {row.kgAlimento > 0 ? row.kgAlimento.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-800">
                        {row.gramsPerHenDay != null ? row.gramsPerHenDay.toFixed(1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 tabular-nums">{totalHuevosAnual}</td>
                    <td className="px-3 py-2 tabular-nums">{totalHuevosVendidosAnual}</td>
                    <td className="px-3 py-2 tabular-nums">{formatArs(totalVentasAnual)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatArs(totalVentasAnual - totalGastosAnual)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatArs(totalGastosAnual)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {totalKgAlimentoAnual > 0 ? totalKgAlimentoAnual.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {gramsPerHenDayAnual != null ? gramsPerHenDayAnual.toFixed(1) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-4 grid gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-5">
              <p>
                <span className="font-semibold">Total Huevos {summaryCalendarYear}:</span>{' '}
                <span className="tabular-nums">{totalHuevosAnual}</span>
              </p>
              <p>
                <span className="font-semibold">Total Ventas {summaryCalendarYear}:</span>{' '}
                <span className="tabular-nums">{formatArs(totalVentasAnual)}</span>
              </p>
              <p>
                <span className="font-semibold">Precio Promedio por Huevo:</span>{' '}
                <span className="tabular-nums">{formatArs(precioPromedioHuevoAnual)}</span>
              </p>
              <p>
                <span className="font-semibold">Total Gastos {summaryCalendarYear}:</span>{' '}
                <span className="tabular-nums">{formatArs(totalGastosAnual)}</span>
              </p>
              <p>
                <span className="font-semibold">Kg Alimento {summaryCalendarYear}:</span>{' '}
                <span className="tabular-nums">
                  {totalKgAlimentoAnual > 0 ? totalKgAlimentoAnual.toFixed(2) : '—'}
                </span>
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
