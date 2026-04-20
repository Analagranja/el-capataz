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
import { computeMonthToDateTotals, currentMonthStartLocalYmd, todayLocalYmd } from '../utils/monthToDateFinance';
import { formatArs } from '../utils/formatCurrency';

interface Estadisticas {
  selectedGallineroId: string | null;
}

const EGGS_PER_SALE_TYPE: Record<Sale['type'], number> = {
  maple: 30,
  docena: 12,
  media_docena: 6,
};

function daysInFilteredPeriod(activeYear: string, selectedMonth: string): number {
  const today = new Date();
  const currentYear = String(today.getFullYear());
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');

  if (selectedMonth) {
    if (activeYear === currentYear && selectedMonth === currentMonth) {
      return Math.max(1, today.getDate());
    }
    return Math.max(1, new Date(Number(activeYear), Number(selectedMonth), 0).getDate());
  }

  if (activeYear === currentYear) {
    return Math.max(1, today.getDate());
  }
  return 365;
}

export default function Estadisticas({ selectedGallineroId }: Estadisticas) {
  const { organizationId } = useAuth();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [production, setProduction] = React.useState<ProductionRecord[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [feedLogs, setFeedLogs] = React.useState<FeedLog[]>([]);
  const [salesMonthToDate, setSalesMonthToDate] = React.useState<Sale[]>([]);
  const [expensesMonthToDate, setExpensesMonthToDate] = React.useState<Expense[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState('');
  const [currentGallineroId, setCurrentGallineroId] = React.useState(selectedGallineroId);
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
      const monthStartYmd = currentMonthStartLocalYmd();
      const todayYmd = todayLocalYmd();
      const [productionData, salesData, expensesData, eventsData, salesMtd, expensesMtd, feedLogsData] = await Promise.all([
        currentGallineroId
          ? productionService.getByGallinero(organizationId, currentGallineroId, 30)
          : productionService.getAll(organizationId, 30),
        salesService.getAll(organizationId, 30),
        expensesService.getAll(organizationId, 90),
        currentGallineroId
          ? eventsService.getByGallinero(organizationId, currentGallineroId, 30)
          : eventsService.getAll(organizationId, 30),
        salesService.getAllRange(organizationId, monthStartYmd, todayYmd),
        expensesService.getAllRange(organizationId, monthStartYmd, todayYmd),
        currentGallineroId
          ? feedLogsService.getByGallinero(organizationId, currentGallineroId, 730)
          : feedLogsService.getAll(organizationId, 730),
      ]);

      setProduction(productionData);
      setSales(salesData);
      setExpenses(expensesData);
      setEvents(eventsData);
      setSalesMonthToDate(salesMtd);
      setExpensesMonthToDate(expensesMtd);
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
    if (selectedGallineroId) {
      setCurrentGallineroId(selectedGallineroId);
    }
  }, [selectedGallineroId]);

  React.useEffect(() => {
    loadData();
  }, [currentGallineroId, organizationId]);

  const availableYears = Array.from(
    new Set(
      [...production, ...sales, ...expenses, ...events, ...feedLogs]
        .map((item) => item.date.split('-')[0])
        .filter(Boolean)
    )
  ).sort((a, b) => b.localeCompare(a));
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

  const getRecordHens = (record: ProductionRecord) =>
    record.poultry_count && record.poultry_count > 0
      ? record.poultry_count
      : gallineros.find((g) => g.id === record.gallinero_id)?.current_count ?? 0;

  const productionChartData = filteredProduction
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: p.date,
      huevos: p.eggs_count,
      postura: parseFloat(computeLayingPercentage(p.eggs_count, getRecordHens(p)).toFixed(1)),
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
  const avgLayingPercentage =
    filteredProduction.length > 0
      ? filteredProduction.reduce(
          (sum, p) => sum + computeLayingPercentage(p.eggs_count, getRecordHens(p)),
          0
        ) / filteredProduction.length
      : 0;
  const totalEggsSold = filteredSales.reduce((sum, sale) => {
    const eggsByType = EGGS_PER_SALE_TYPE[sale.type] || 0;
    return sum + sale.quantity * eggsByType;
  }, 0);
  const totalSalesAmount = filteredSales.reduce((sum, s) => sum + s.total_price, 0);
  const avgPricePerEgg = totalEggsSold > 0 ? totalSalesAmount / totalEggsSold : 0;
  const monthToDateFinance = computeMonthToDateTotals(
    salesMonthToDate,
    expensesMonthToDate,
    currentMonthStartLocalYmd(),
    todayLocalYmd()
  );
  const totalFeedKg = filteredFeedLogs.reduce((sum, f) => sum + (f.kg_opened || 0), 0);
  const hensForConsumption = currentGallineroId
    ? gallineros.find((g) => g.id === currentGallineroId)?.current_count ?? 0
    : gallineros.reduce((sum, g) => sum + g.current_count, 0);
  const daysForConsumption = daysInFilteredPeriod(activeYear, selectedMonth);
  const gramsPerHenPerDay =
    hensForConsumption > 0 && totalFeedKg > 0 ? ((totalFeedKg / hensForConsumption) / daysForConsumption) * 1000 : 0;

  const gallineroOptions = [
    { value: '', label: 'Todos los Gallineros' },
    ...gallineros.map((g) => ({
      value: g.id,
      label: `${g.name} (${g.current_count} gallinas)`,
    })),
  ];

  const handleExportData = async () => {
    if (!organizationId) return;
    setExportError('');
    setExporting(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const toYmd = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const endD = new Date();
      const startD = new Date();
      startD.setDate(startD.getDate() - 730);
      const from = toYmd(startD);
      const to = toYmd(endD);

      const [saleRows, prodRows] = await Promise.all([
        salesService.getAllRange(organizationId, from, to),
        currentGallineroId
          ? productionService.getByGallineroRange(organizationId, currentGallineroId, from, to)
          : productionService.getAllRange(organizationId, from, to),
      ]);

      const gallineroNameById = new Map(gallineros.map((g) => [g.id, g.name]));
      downloadSalesAndProductionExcel({
        sales: saleRows,
        production: prodRows,
        gallineroNameById,
        fromLabel: from,
        toLabel: to,
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

      {gallineros.length > 0 && (
        <Card padding="md">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Filtrar por Gallinero"
              options={gallineroOptions}
              value={currentGallineroId || ''}
              onChange={(e) => setCurrentGallineroId(e.target.value || null)}
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
      )}

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
            <p className="text-sm text-gray-600 mb-1">Huevos Puestos (30d)</p>
            <p className="text-2xl font-bold text-gray-900">{totalEggsProduced}</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">% Postura Promedio</p>
            <p className="text-2xl font-bold text-gray-900">{avgLayingPercentage.toFixed(1)}%</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Huevos Vendidos (30d)</p>
            <p className="text-2xl font-bold text-gray-900">{totalEggsSold}</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Precio Promedio por Huevo</p>
            <p className="text-2xl font-bold text-gray-900">{formatArs(avgPricePerEgg)}</p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Ganancia</p>
            <p
              className={`text-2xl font-bold ${
                monthToDateFinance.gananciaDelMes >= 0 ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {formatArs(monthToDateFinance.gananciaDelMes)}
            </p>
          </div>
        </Card>

        <Card padding="md" hover>
          <div>
            <p className="text-sm text-gray-600 mb-1">Consumo por ave/día</p>
            <p className="text-2xl font-bold text-gray-900">{Math.round(gramsPerHenPerDay)} g</p>
            <p className="text-xs text-gray-500 mt-1">
              Bolsas abiertas: {totalFeedKg.toFixed(2)} kg / {daysForConsumption} días
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
