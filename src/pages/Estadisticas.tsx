import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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
import { ProductionRecord, Sale, Event, Gallinero, Expense, FeedLog } from '../types';
import { productionService, computeLayingPercentage } from '../services/production';
import { salesService } from '../services/sales';
import { eventsService } from '../services/events';
import { gallinerosService } from '../services/gallineros';
import { expensesService } from '../services/expenses';
import { feedLogsService } from '../services/feedLogs';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { Download } from 'lucide-react';
import { downloadSalesAndProductionExcel } from '../utils/exportFarmData';
import { computeMonthToDateTotals } from '../utils/monthToDateFinance';
import { boundsForYearMonthFilter, boundsForCalendarYear, todayLocalYmdParts } from '../utils/statsPeriod';
import { formatArs } from '../utils/formatCurrency';

// TODO: agregar filtro por gallinero en versión futura

const EGGS_PER_SALE_TYPE: Record<Sale['type'], number> = {
  maple: 30,
  docena: 12,
  media_docena: 6,
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
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState('');
  const [selectedYear, setSelectedYear] = React.useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');

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

  const loadMonthlySummary = async () => {
    if (!organizationId) return;
    try {
      setSummaryLoading(true);
      const sy = new Date().getFullYear();
      const { fromYmd, toYmd } = boundsForCalendarYear(sy);
      const [prod, saleRows, expRows] = await Promise.all([
        productionService.getAllRange(organizationId, fromYmd, toYmd),
        salesService.getAllRange(organizationId, fromYmd, toYmd),
        expensesService.getAllRange(organizationId, fromYmd, toYmd),
      ]);
      setSummaryProduction(prod);
      setSummarySales(saleRows);
      setSummaryExpenses(expRows);
    } catch (error) {
      console.error('Error loading monthly summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  };

  React.useEffect(() => {
    loadGallineros();
  }, [organizationId]);

  React.useEffect(() => {
    loadData();
  }, [organizationId, selectedYear]);

  React.useEffect(() => {
    loadMonthlySummary();
  }, [organizationId]);

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

  const filteredProduction = production.filter((p) => dateMatchesFilter(p.date));
  const filteredSales = sales.filter((s) => dateMatchesFilter(s.date));
  const filteredExpenses = expenses.filter((e) => dateMatchesFilter(e.date));
  const filteredEvents = events.filter((e) => dateMatchesFilter(e.date));
  const filteredFeedLogs = feedLogs.filter((f) => dateMatchesFilter(f.date));

  /** Total aves de la organización (todos los gallineros); base para postura y consumo/ave. */
  const totalFarmHens = gallineros.reduce(
    (sum, g) => sum + Math.max(0, Math.floor(Number(g.current_count) || 0)),
    0
  );

  const eggsByDate = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of filteredProduction) {
      m.set(p.date, (m.get(p.date) ?? 0) + p.eggs_count);
    }
    return m;
  }, [filteredProduction]);

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

  const salesByDate = filteredSales
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((acc: Array<{ date: string; total: number; huevosEquiv: number }>, sale) => {
      const eggs = EGGS_PER_SALE_TYPE[sale.type] || 0;
      const huevosDia = sale.quantity * eggs;
      const existing = acc.find((item) => item.date === sale.date);
      if (existing) {
        existing.total += sale.total_price;
        existing.huevosEquiv += huevosDia;
      } else {
        acc.push({
          date: sale.date,
          total: sale.total_price,
          huevosEquiv: huevosDia,
        });
      }
      return acc;
    }, []);

  const eventsByType = [
    {
      name: 'Muertes',
      value: filteredEvents
        .filter((e) => e.event_type === 'muerte')
        .reduce((sum, e) => sum + e.affected_count, 0),
    },
    {
      name: 'Vacunación',
      value: filteredEvents.filter((e) => e.event_type === 'vacunacion').length,
    },
    {
      name: 'Otros eventos',
      value: filteredEvents.filter((e) =>
        ['otros', 'vitaminas', 'medicacion', 'ingreso_pollitas'].includes(e.event_type)
      ).length,
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
  const periodFinance = computeMonthToDateTotals(
    filteredSales,
    filteredExpenses,
    periodBounds.fromYmd,
    periodBounds.toYmd
  );
  const totalFeedKg = filteredFeedLogs.reduce((sum, f) => sum + (f.kg_opened || 0), 0);
  const gramsPerHenPerDay =
    totalFarmHens > 0 && totalFeedKg > 0 && periodBounds.dayCount > 0
      ? (totalFeedKg * 1000) / (totalFarmHens * periodBounds.dayCount)
      : 0;

  const summaryCalendarYear = new Date().getFullYear();
  const padMonth = (n: number) => String(n).padStart(2, '0');
  const monthlySummaryRows = MONTH_NAMES.map((monthLabel, idx) => {
    const m = idx + 1;
    const prefix = `${summaryCalendarYear}-${padMonth(m)}`;
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
    return {
      monthLabel,
      totalHuevosMes,
      huevosVendidosMes,
      netoMes,
      gananciaMes,
    };
  });
  const totalHuevosAnual = monthlySummaryRows.reduce((sum, r) => sum + r.totalHuevosMes, 0);
  const totalVentasAnual = monthlySummaryRows.reduce((sum, r) => sum + r.netoMes, 0);
  const totalHuevosVendidosAnual = monthlySummaryRows.reduce((sum, r) => sum + r.huevosVendidosMes, 0);
  const precioPromedioHuevoAnual =
    totalHuevosVendidosAnual > 0 ? totalVentasAnual / totalHuevosVendidosAnual : 0;

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {eventsByType.some((item) => item.value > 0) && (
          <Card padding="md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Eventos Registrados</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={eventsByType}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {salesByDate.length > 0 && (
        <Card padding="md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Ventas diarias</h3>
          <p className="text-sm text-gray-600 mb-3">
            Barras verdes: ingresos en pesos por día. Barras azules: huevos vendidos (equivalente: Maple 30, Docena
            12, Media 6 por unidad).
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesByDate}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" tickFormatter={(v) => `$${v}`} />
              <YAxis yAxisId="right" orientation="right" label={{ value: 'Huevos', angle: -90, position: 'insideRight' }} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  String(name).includes('Ingresos')
                    ? [formatArs(value), name]
                    : [`${Math.round(value)} huevos`, name]
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="total" fill="#10b981" name="Ingresos ($)" />
              <Bar yAxisId="right" dataKey="huevosEquiv" fill="#3b82f6" name="Huevos vendidos (equiv.)" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

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
            <p className="text-2xl font-bold text-gray-900">{Math.round(gramsPerHenPerDay)} g</p>
            <p className="text-xs text-gray-500 mt-1">
              Alimento: {totalFeedKg.toFixed(2)} kg · {periodBounds.dayCount} día(s) del período ·{' '}
              {totalFarmHens} aves (toda la granja)
            </p>
          </div>
        </Card>
      </div>

      <Card padding="md">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Resumen Mensual</h3>
        <p className="text-sm text-gray-600 mb-4">
          Vista tipo planilla: totales por mes del año {summaryCalendarYear} (toda la organización).
        </p>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-800 sm:grid-cols-3">
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
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
