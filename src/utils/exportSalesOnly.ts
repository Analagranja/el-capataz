import type { Sale } from '../types';
import { formatArs } from './formatCurrency';
import { UNASSIGNED_CUSTOMER_LABEL } from './unpaidSales';

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

function safeMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function excelTextMoneyTd(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `<td align="right" style="mso-number-format:'\\@'">${escapeHtml(formatArs(n))}</td>`;
}

function salePaymentLabel(sale: Sale): string {
  return sale.is_paid === false ? 'Pendiente' : 'Pagado';
}

/** Desglose de cobro sobre las ventas del período (las que ya están en memoria). */
export function salesPeriodPaymentBreakdown(sales: Sale[]): {
  cobrado: number;
  pendiente: number;
  total: number;
} {
  let cobrado = 0;
  let pendiente = 0;
  for (const s of sales) {
    const amount = safeMoney(s.total_price);
    if (s.is_paid === false) pendiente += amount;
    else cobrado += amount;
  }
  return { cobrado, pendiente, total: cobrado + pendiente };
}

/** HTML del .xls de ventas (sin disparar la descarga). */
export function buildSalesExcelHtml(sales: Sale[], periodLabel: string): string {
  const breakdown = salesPeriodPaymentBreakdown(sales);
  const rows = [...sales]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.date)}</td><td>${escapeHtml(s.customer_name || UNASSIGNED_CUSTOMER_LABEL)}</td><td>${escapeHtml(SALE_TYPE_LABEL[s.type] || s.type)}</td><td>${s.quantity}</td>${excelTextMoneyTd(safeMoney(s.price_per_unit))}${excelTextMoneyTd(safeMoney(s.total_price))}<td>${escapeHtml(salePaymentLabel(s))}</td><td>${escapeHtml(s.notes || '')}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <title>Ventas El Capataz</title>
</head>
<body>
  <p><strong>El Capataz</strong> — Ventas ${escapeHtml(periodLabel)}</p>
  <table border="1" cellspacing="0" cellpadding="6">
    <thead>
      <tr style="background-color:#16a34a;color:white;">
        <th colspan="2">Resumen del período</th>
      </tr>
    </thead>
    <tbody>
      <tr style="font-weight:bold;">
        <td>Total del período</td>
        ${excelTextMoneyTd(breakdown.total)}
      </tr>
      <tr>
        <td>Ya cobrado</td>
        ${excelTextMoneyTd(breakdown.cobrado)}
      </tr>
      <tr>
        <td>Pendiente de cobro</td>
        ${excelTextMoneyTd(breakdown.pendiente)}
      </tr>
    </tbody>
  </table>
  <br/>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Cliente</th>
        <th>Tipo</th>
        <th>Cantidad</th>
        <th>Precio unitario</th>
        <th>Total</th>
        <th>Estado</th>
        <th>Notas</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="8">Sin registros</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

/**
 * Exporta solo las ventas del período a .xls (HTML) para Excel.
 * Usa el array ya filtrado en pantalla; no consulta la base.
 */
export function downloadSalesExcel(sales: Sale[], periodLabel: string): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const html = buildSalesExcelHtml(sales, periodLabel);
  const blob = new Blob([`\ufeff${html}`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ElCapataz_ventas_${stamp}.xls`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
