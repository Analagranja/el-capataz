import type { Customer, Expense, ProductionRecord, Sale } from '../types';
import { formatArs } from './formatCurrency';
import { boundsForYearMonthFilter } from './statsPeriod';

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SALE_TYPE_LABEL: Record<Sale['type'], string> = {
  maple: 'Maple',
  docena: 'Docena',
  media_docena: 'Media docena',
  pack15: 'Pack x15',
  maple_grande: 'Maple Grande',
  maple_mediano: 'Maple Mediano',
  maple_chico: 'Maple Chico',
};

/** Equivalente en huevos por unidad vendida. */
const EGGS_PER_SALE_TYPE: Record<Sale['type'], number> = {
  maple: 30,
  docena: 12,
  media_docena: 6,
  pack15: 15,
  maple_grande: 30,
  maple_mediano: 30,
  maple_chico: 30,
};

const MONTH_NAMES_ES = [
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

function safeMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Precio promedio por huevo = Total Ventas ÷ Total Huevos Vendidos (misma fórmula que Estadísticas).
 * Sin redondeo intermedio; el redondeo a 2 decimales va en la presentación (`formatArs`).
 */
function averagePricePerEgg(totalVentasPeriod: number, huevosVendidosUnits: number): number {
  const ventas = safeMoney(totalVentasPeriod);
  const huevos = safeMoney(huevosVendidosUnits);
  if (!(huevos > 0)) return 0;
  const raw = ventas / huevos;
  return Number.isFinite(raw) ? raw : 0;
}

/** Celda monetaria como texto (formato idéntico a la pantalla) para que Excel es-AR no reinterprete `.` / `,`. */
function excelTextMoneyTd(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `<td align="right" style="mso-number-format:'\\@'">${escapeHtml(formatArs(n))}</td>`;
}

/** Prefijo YYYY-MM-DD al inicio del string (acepta ISO con hora). */
function parseLocalYmdPrefix(dateStr: string): string | null {
  const m = String(dateStr ?? '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function ymFromYmd(ymd: string): string | null {
  const d = parseLocalYmdPrefix(ymd);
  if (!d) return null;
  return d.slice(0, 7);
}

function dateInExportRange(ymd: string, fromYmd: string, toYmd: string): boolean {
  const d = parseLocalYmdPrefix(ymd);
  if (!d) return false;
  const from = fromYmd.slice(0, 10);
  const to = toYmd.slice(0, 10);
  return d >= from && d <= to;
}

/** Meses (YYYY-MM) con al menos un registro de producción, ventas o gastos en el rango. */
function collectMonthsWithActivity(
  sales: Sale[],
  production: ProductionRecord[],
  expenses: Expense[],
  fromYmd: string,
  toYmd: string
): string[] {
  const set = new Set<string>();
  for (const p of production) {
    if (dateInExportRange(p.date, fromYmd, toYmd)) {
      const ym = ymFromYmd(p.date);
      if (ym) set.add(ym);
    }
  }
  for (const s of sales) {
    if (dateInExportRange(s.date, fromYmd, toYmd)) {
      const ym = ymFromYmd(s.date);
      if (ym) set.add(ym);
    }
  }
  for (const e of expenses) {
    if (dateInExportRange(e.date, fromYmd, toYmd)) {
      const ym = ymFromYmd(e.date);
      if (ym) set.add(ym);
    }
  }
  return Array.from(set).sort();
}

function monthLabelEs(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const y = ym.slice(0, 4);
  if (m < 1 || m > 12) return ym;
  return `${MONTH_NAMES_ES[m - 1]} ${y}`;
}

function eggsSoldAsUnits(sale: Sale): number {
  const perPack = EGGS_PER_SALE_TYPE[sale.type] ?? 0;
  return safeMoney(sale.quantity) * perPack;
}

function buildMonthlySummaryRows(
  sales: Sale[],
  production: ProductionRecord[],
  expenses: Expense[],
  fromYmd: string,
  toYmd: string
): Array<{
  ym: string;
  label: string;
  huevos: number;
  huevosVendidos: number;
  precioPromedioHuevo: number;
  ventas: number;
  gastosAlimento: number;
  gastosOtros: number;
  gastos: number;
  ganancia: number;
}> {
  const from = fromYmd.slice(0, 10);
  const to = toYmd.slice(0, 10);
  const months = collectMonthsWithActivity(sales, production, expenses, from, to);
  const rows = months.map((ym) => {
    const huevos = production
      .filter((p) => ymFromYmd(p.date) === ym && dateInExportRange(p.date, from, to))
      .reduce((sum, p) => sum + safeMoney(p.eggs_count), 0);
    const monthSales = sales.filter(
      (s) => ymFromYmd(s.date) === ym && dateInExportRange(s.date, from, to)
    );
    const ventas = monthSales.reduce((sum, s) => sum + safeMoney(s.total_price), 0);
    const huevosVendidos = monthSales.reduce((sum, s) => sum + eggsSoldAsUnits(s), 0);
    const precioPromedioHuevo = averagePricePerEgg(ventas, huevosVendidos);
    const monthExpenses = expenses.filter(
      (e) => ymFromYmd(e.date) === ym && dateInExportRange(e.date, from, to)
    );
    const gastosAlimento = monthExpenses
      .filter((e) => e.description === 'Alimento')
      .reduce((sum, e) => sum + safeMoney(e.total_price), 0);
    const gastosOtros = monthExpenses
      .filter((e) => e.description !== 'Alimento')
      .reduce((sum, e) => sum + safeMoney(e.total_price), 0);
    const gastosTotales = gastosAlimento + gastosOtros;
    const ganancia = ventas - gastosTotales;
    return {
      ym,
      label: monthLabelEs(ym),
      huevos,
      huevosVendidos,
      precioPromedioHuevo,
      ventas,
      gastosAlimento,
      gastosOtros,
      gastos: gastosTotales,
      ganancia: Number.isFinite(ganancia) ? ganancia : 0,
    };
  });
  return rows.filter(
    (r) => r.huevos !== 0 || r.huevosVendidos !== 0 || r.ventas !== 0 || r.gastos !== 0
  );
}

/**
 * Exporta ventas, producción y resumen mensual en un solo archivo .xls (HTML) que Excel abre sin dependencias extra.
 */
export function downloadSalesAndProductionExcel(options: {
  /** Detalle: ventas/producción/gastos acotados al filtro Año/Mes de Estadísticas. */
  sales: Sale[];
  production: ProductionRecord[];
  expenses: Expense[];
  /** Resumen mensual: año calendario `summaryYear` (siempre “Todos los meses” de ese año en BD). */
  summarySales: Sale[];
  summaryProduction: ProductionRecord[];
  summaryExpenses: Expense[];
  summaryYear: string;
  gallineroNameById: Map<string, string>;
  fromLabel: string;
  toLabel: string;
}): void {
  const {
    sales,
    production,
    expenses,
    summarySales,
    summaryProduction,
    summaryExpenses,
    summaryYear,
    gallineroNameById,
    fromLabel,
    toLabel,
  } = options;
  const stamp = new Date().toISOString().slice(0, 10);
  const summaryBounds = boundsForYearMonthFilter(summaryYear, '', new Date());

  const salesRows = [...sales]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.date)}</td><td>${escapeHtml(s.customer_name || '')}</td><td>${escapeHtml(SALE_TYPE_LABEL[s.type] || s.type)}</td><td>${s.quantity}</td><td>${s.price_per_unit}</td><td>${s.total_price}</td><td>${escapeHtml(s.notes || '')}</td></tr>`
    )
    .join('');

  const prodRows = [...production]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => {
      const gName = gallineroNameById.get(p.gallinero_id) || p.gallinero_id;
      return `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(gName)}</td><td>${p.eggs_count}</td><td>${p.broken_dirty_eggs_count}</td><td>${p.poultry_count}</td><td>${Number(p.laying_percentage).toFixed(2)}</td><td>${escapeHtml(p.notes || '')}</td></tr>`;
    })
    .join('');

  const alimentoGastosRows = [...expenses]
    .filter((e) => e.description === 'Alimento')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const kg = safeMoney(e.quantity_kg);
      const total = safeMoney(e.total_price);
      const costoPorKg = kg > 0 ? total / kg : 0;
      return `<tr>
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.gallinero_name || 'General')}</td>
      <td>${kg.toFixed(2)}</td>
      ${excelTextMoneyTd(total)}
      ${excelTextMoneyTd(costoPorKg)}
    </tr>`;
    })
    .join('');

  const otrosGastosRows = [...expenses]
    .filter((e) => e.description !== 'Alimento')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (e) =>
        `<tr>
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.description)}</td>
      <td>${escapeHtml(e.gallinero_name || 'General')}</td>
      ${excelTextMoneyTd(safeMoney(e.total_price))}
    </tr>`
    )
    .join('');

  const totalVentasPeriodo = sales.reduce((s, v) => s + safeMoney(v.total_price), 0);
  const totalAlimentoPeriodo = expenses
    .filter((e) => e.description === 'Alimento')
    .reduce((s, e) => s + safeMoney(e.total_price), 0);
  const totalOtrosPeriodo = expenses
    .filter((e) => e.description !== 'Alimento')
    .reduce((s, e) => s + safeMoney(e.total_price), 0);
  const totalEgresosPeriodo = totalAlimentoPeriodo + totalOtrosPeriodo;
  const resultadoPeriodo = totalVentasPeriodo - totalEgresosPeriodo;

  const monthlyRows = buildMonthlySummaryRows(
    summarySales,
    summaryProduction,
    summaryExpenses,
    summaryBounds.fromYmd,
    summaryBounds.toYmd
  );
  const sumFrom = summaryBounds.fromYmd.slice(0, 10);
  const sumTo = summaryBounds.toYmd.slice(0, 10);

  const totalHuevos = monthlyRows.reduce((s, r) => s + r.huevos, 0);
  const totalHuevosVendidos = monthlyRows.reduce((s, r) => s + r.huevosVendidos, 0);
  const totalVentas = monthlyRows.reduce((s, r) => s + r.ventas, 0);
  const totalGastosAlimento = monthlyRows.reduce((s, r) => s + r.gastosAlimento, 0);
  const totalGastosOtros = monthlyRows.reduce((s, r) => s + r.gastosOtros, 0);
  const totalGastos = monthlyRows.reduce((s, r) => s + r.gastos, 0);
  const totalGanancia = totalVentas - totalGastos;
  const precioPromedioHuevoAcumulado = averagePricePerEgg(totalVentas, totalHuevosVendidos);

  const monthlyBody =
    monthlyRows.length === 0
      ? `<tr><td colspan="9">Sin meses con datos en el año ${escapeHtml(summaryYear)} (${escapeHtml(sumFrom)} a ${escapeHtml(sumTo)}).</td></tr>`
      : monthlyRows
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.label)}</td><td>${r.huevos}</td><td>${r.huevosVendidos}</td>${excelTextMoneyTd(r.precioPromedioHuevo)}${excelTextMoneyTd(r.ventas)}${excelTextMoneyTd(r.gastosAlimento)}${excelTextMoneyTd(r.gastosOtros)}${excelTextMoneyTd(r.gastos)}${excelTextMoneyTd(r.ganancia)}</tr>`
          )
          .join('');

  const totalRow =
    monthlyRows.length === 0
      ? ''
      : `<tr style="font-weight:bold;background-color:#f3f4f6;"><td>Total Acumulado</td><td>${totalHuevos}</td><td>${totalHuevosVendidos}</td>${excelTextMoneyTd(precioPromedioHuevoAcumulado)}${excelTextMoneyTd(totalVentas)}${excelTextMoneyTd(totalGastosAlimento)}${excelTextMoneyTd(totalGastosOtros)}${excelTextMoneyTd(totalGastos)}${excelTextMoneyTd(totalGanancia)}</tr>`;

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <title>Exportación El Capataz</title>
</head>
<body>
  <p><strong>El Capataz</strong> — Detalle de ventas y producción: ${escapeHtml(fromLabel)} a ${escapeHtml(toLabel)} (filtro Año/Mes en Estadísticas).</p>
  <p style="font-size:12px;color:#333;"><strong>Resumen mensual:</strong> año calendario ${escapeHtml(summaryYear)}, del ${escapeHtml(summaryBounds.fromYmd)} al ${escapeHtml(summaryBounds.toYmd)}. Solo aparecen meses con al menos un registro y con totales distintos de cero; el filtro de mes <em>no</em> afecta esta tabla.</p>
  <h2>Resumen Financiero — ${escapeHtml(fromLabel)} a ${escapeHtml(toLabel)}</h2>
  <table border="1" cellspacing="0" cellpadding="6">
    <thead>
      <tr style="background-color:#16a34a;color:white;">
        <th colspan="2">Resumen del período ${escapeHtml(fromLabel)} al ${escapeHtml(toLabel)}</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background-color:#dcfce7;font-weight:bold;">
        <td>INGRESOS</td><td></td>
      </tr>
      <tr>
        <td style="padding-left:20px">Ventas</td>
        ${excelTextMoneyTd(totalVentasPeriodo)}
      </tr>
      <tr style="font-weight:bold;">
        <td>Total Ingresos</td>
        ${excelTextMoneyTd(totalVentasPeriodo)}
      </tr>
      <tr><td colspan="2"></td></tr>
      <tr style="background-color:#fee2e2;font-weight:bold;">
        <td>EGRESOS</td><td></td>
      </tr>
      <tr>
        <td style="padding-left:20px">Alimento</td>
        ${excelTextMoneyTd(totalAlimentoPeriodo)}
      </tr>
      <tr>
        <td style="padding-left:20px">Otros gastos</td>
        ${excelTextMoneyTd(totalOtrosPeriodo)}
      </tr>
      <tr style="font-weight:bold;">
        <td>Total Egresos</td>
        ${excelTextMoneyTd(totalEgresosPeriodo)}
      </tr>
      <tr><td colspan="2"></td></tr>
      <tr style="font-weight:bold;font-size:14px;background-color:#f3f4f6;">
        <td>RESULTADO</td>
        ${excelTextMoneyTd(resultadoPeriodo)}
      </tr>
    </tbody>
  </table>
  <br/><br/>
  <h2>Ventas</h2>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Cantidad</th><th>Precio unit.</th><th>Total</th><th>Notas</th></tr></thead>
    <tbody>${salesRows || '<tr><td colspan="7">Sin registros</td></tr>'}</tbody>
  </table>
  <br/><br/>
  <h2>Producción</h2>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead><tr><th>Fecha</th><th>Gallinero</th><th>Huevos</th><th>Rotos/sucios</th><th>Gallinas (reg.)</th><th>% Postura</th><th>Notas</th></tr></thead>
    <tbody>${prodRows || '<tr><td colspan="7">Sin registros</td></tr>'}</tbody>
  </table>
  <br/><br/>
  <h2>Gastos de Alimento</h2>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead><tr><th>Fecha</th><th>Gallinero</th><th>Kg</th><th>Total</th><th>Costo/kg</th></tr></thead>
    <tbody>${alimentoGastosRows || '<tr><td colspan="5">Sin registros</td></tr>'}</tbody>
  </table>
  <br/><br/>
  <h2>Otros Gastos</h2>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead><tr><th>Fecha</th><th>Categoría</th><th>Gallinero</th><th>Total</th></tr></thead>
    <tbody>${otrosGastosRows || '<tr><td colspan="4">Sin registros</td></tr>'}</tbody>
  </table>
  <br/><br/>
  <h2>Resumen Mensual</h2>
  <p style="font-size:11px;color:#555;"><strong>Total Huevos Vendidos</strong> = equivalente en huevos (Maple 30, Docena 12, Media docena 6 por unidad). <strong>Precio Promedio por Huevo</strong> = ventas del mes ÷ huevos vendidos del mes. <strong>Ganancia ($)</strong> = ventas del mes − gastos del mes (alimento + otros). <strong>Total Acumulado</strong> = suma de las filas mensuales mostradas. Consulta en base: fecha &lt; día siguiente al fin del rango (incluye todo el último día). Los importes se exportan como texto ($ y dos decimales) para Excel regional.</p>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead>
      <tr>
        <th>Mes</th>
        <th>Total Huevos del mes</th>
        <th>Total Huevos Vendidos</th>
        <th>Precio Promedio por Huevo</th>
        <th>Total Ventas del mes</th>
        <th>Gastos Alimento</th>
        <th>Otros Gastos</th>
        <th>Total Gastos</th>
        <th>Ganancia ($)</th>
      </tr>
    </thead>
    <tbody>${monthlyBody}${totalRow}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([`\ufeff${html}`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ElCapataz_ventas_produccion_${stamp}.xls`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta solo la agenda de clientes a .xls (HTML) para Excel.
 */
export function downloadCustomersExcel(customers: Customer[]): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const rows = [...customers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || '')}</td><td>${escapeHtml(c.address || '')}</td><td>${escapeHtml(c.notes || '')}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <title>Clientes El Capataz</title>
</head>
<body>
  <p><strong>El Capataz</strong> — Agenda de clientes</p>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Notas</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">Sin registros</td></tr>'}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([`\ufeff${html}`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ElCapataz_clientes_${stamp}.xls`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
