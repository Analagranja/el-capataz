import type { Customer, Expense, ProductionRecord, Sale } from '../types';

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
};

/** Equivalente en huevos por unidad vendida (maple/docena/media docena). */
const EGGS_PER_SALE_TYPE: Record<Sale['type'], number> = {
  maple: 30,
  docena: 12,
  media_docena: 6,
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

/** Estilo de celda para moneda en Excel (HTML): $#,##0.00 */
const TD_MONEY = `style="mso-number-format:'\\$#,##0\\.00'"`;

function safeMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Dos decimales para montos y promedios exportados a Excel. */
function roundMoney2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Precio promedio por huevo = Total Ventas del período ÷ Total Huevos Vendidos (equivalente en unidades).
 * Solo división; sin factores extra. Si no hay huevos vendidos → 0 (evita división por cero).
 */
function averagePricePerEgg(totalVentasPeriod: number, huevosVendidosUnits: number): number {
  const ventas = safeMoney(totalVentasPeriod);
  const huevos = safeMoney(huevosVendidosUnits);
  if (!(huevos > 0)) return 0;
  const raw = ventas / huevos;
  if (!Number.isFinite(raw)) return 0;
  return roundMoney2(raw);
}

/**
 * Celda de moneda para Excel HTML: valor explícitamente numérico (`x:num`) + mismo formato que el resto (`TD_MONEY`).
 * Evita que Excel interprete mal el número al abrir el .xls exportado.
 */
function excelCurrency2DecimalsTd(value: number): string {
  const n = roundMoney2(value);
  const text = n.toFixed(2);
  /* x:num + sdval: Excel (sobre todo en locale es-AR) interpreta bien el número; no concatenar ni multiplicar. */
  return `<td align="right" lang="en-US" x:num="${text}" sdval="${text}" ${TD_MONEY}>${text}</td>`;
}

function ymFromYmd(ymd: string): string | null {
  const d = String(ymd || '').trim().slice(0, 10);
  if (d.length < 7) return null;
  return d.slice(0, 7);
}

function dateInExportRange(ymd: string, fromYmd: string, toYmd: string): boolean {
  const d = String(ymd || '').trim().slice(0, 10);
  const from = fromYmd.slice(0, 10);
  const to = toYmd.slice(0, 10);
  return d.length >= 10 && d >= from && d <= to;
}

/** Solo meses (YYYY-MM) que tengan al menos un registro de producción, ventas o gastos en el rango exportado. */
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
  gastos: number;
  ganancia: number;
}> {
  const months = collectMonthsWithActivity(sales, production, expenses, fromYmd, toYmd);
  return months.map((ym) => {
    const huevos = production
      .filter((p) => p.date.startsWith(ym))
      .reduce((sum, p) => sum + safeMoney(p.eggs_count), 0);
    const monthSales = sales.filter((s) => s.date.startsWith(ym));
    const ventas = monthSales.reduce((sum, s) => sum + safeMoney(s.total_price), 0);
    const huevosVendidos = monthSales.reduce((sum, s) => sum + eggsSoldAsUnits(s), 0);
    const precioPromedioHuevo = averagePricePerEgg(ventas, huevosVendidos);
    const gastos = expenses
      .filter((e) => e.date.startsWith(ym))
      .reduce((sum, e) => sum + safeMoney(e.total_price), 0);
    const ganancia = ventas - gastos;
    return {
      ym,
      label: monthLabelEs(ym),
      huevos,
      huevosVendidos,
      precioPromedioHuevo,
      ventas,
      gastos,
      ganancia: Number.isFinite(ganancia) ? ganancia : 0,
    };
  });
}

/**
 * Exporta ventas, producción y resumen mensual en un solo archivo .xls (HTML) que Excel abre sin dependencias extra.
 */
export function downloadSalesAndProductionExcel(options: {
  sales: Sale[];
  production: ProductionRecord[];
  expenses: Expense[];
  gallineroNameById: Map<string, string>;
  fromLabel: string;
  toLabel: string;
}): void {
  const { sales, production, expenses, gallineroNameById, fromLabel, toLabel } = options;
  const stamp = new Date().toISOString().slice(0, 10);

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

  const monthlyRows = buildMonthlySummaryRows(sales, production, expenses, fromLabel, toLabel);
  const totalHuevos = monthlyRows.reduce((s, r) => s + r.huevos, 0);
  const totalHuevosVendidos = monthlyRows.reduce((s, r) => s + r.huevosVendidos, 0);
  const totalVentas = monthlyRows.reduce((s, r) => s + r.ventas, 0);
  const totalGastos = monthlyRows.reduce((s, r) => s + r.gastos, 0);
  const totalGanancia = monthlyRows.reduce((s, r) => s + r.ganancia, 0);
  const precioPromedioHuevoAcumulado = averagePricePerEgg(totalVentas, totalHuevosVendidos);

  const monthlyBody =
    monthlyRows.length === 0
      ? '<tr><td colspan="7">Sin meses con datos en el rango (no hay producción, ventas ni gastos registrados).</td></tr>'
      : monthlyRows
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.label)}</td><td>${r.huevos}</td><td>${r.huevosVendidos}</td>${excelCurrency2DecimalsTd(r.precioPromedioHuevo)}<td ${TD_MONEY}>${r.ventas}</td><td ${TD_MONEY}>${r.gastos}</td><td ${TD_MONEY}>${r.ganancia}</td></tr>`
          )
          .join('');

  const totalRow =
    monthlyRows.length === 0
      ? ''
      : `<tr style="font-weight:bold;background-color:#f3f4f6;"><td>Total Acumulado</td><td>${totalHuevos}</td><td>${totalHuevosVendidos}</td>${excelCurrency2DecimalsTd(precioPromedioHuevoAcumulado)}<td ${TD_MONEY}>${totalVentas}</td><td ${TD_MONEY}>${totalGastos}</td><td ${TD_MONEY}>${totalGanancia}</td></tr>`;

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <title>Exportación El Capataz</title>
</head>
<body>
  <p><strong>El Capataz</strong> — Exportación de datos (${escapeHtml(fromLabel)} a ${escapeHtml(toLabel)})</p>
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
  <h2>Resumen Mensual</h2>
  <p style="font-size:11px;color:#555;">Período: ${escapeHtml(fromLabel)} a ${escapeHtml(toLabel)}. Solo se listan meses con al menos un registro de producción, ventas o gastos. <strong>Total Huevos Vendidos</strong> suma el equivalente en huevos (Maple 30, Docena 12, Media docena 6 por unidad vendida). <strong>Precio Promedio por Huevo</strong> = Total Ventas del mes ÷ Total Huevos Vendidos. <strong>Ganancia ($)</strong> = ventas del mes − gastos del mes.</p>
  <table border="1" cellspacing="0" cellpadding="4" lang="en-US">
    <thead>
      <tr>
        <th>Mes</th>
        <th>Total Huevos del mes</th>
        <th>Total Huevos Vendidos</th>
        <th>Precio Promedio por Huevo</th>
        <th>Total Ventas del mes</th>
        <th>Total Gastos del mes</th>
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
