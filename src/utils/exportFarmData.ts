import type { Customer, ProductionRecord, Sale } from '../types';

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

/**
 * Exporta ventas y producción en un solo archivo .xls (HTML) que Excel abre sin dependencias extra.
 */
export function downloadSalesAndProductionExcel(options: {
  sales: Sale[];
  production: ProductionRecord[];
  gallineroNameById: Map<string, string>;
  fromLabel: string;
  toLabel: string;
}): void {
  const { sales, production, gallineroNameById, fromLabel, toLabel } = options;
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
