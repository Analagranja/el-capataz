/**
 * Tests de stock automático Huevos + Maples + Alimento.
 * Ejecutar: npx --yes tsx src/services/inventoryStock.salesDeductions.test.ts
 */
import assert from 'node:assert/strict';
import {
  aggregateClosedMonthFeedRates,
  availableEggStockForSale,
  availableMapleStockForSale,
  computeEggStock,
  computeFeedStockKg,
  computeMapleStock,
  computeMapleStockFromBaseline,
  dateOnOrAfter,
  eggImpactForSale,
  estimateDaysFromFeedKg,
  estimateFeedDaysRemaining,
  mapleImpactForSale,
  sumDeclaredFeedConsumptionKg,
  type MapleStockItemKey,
} from './inventoryStockCalc';
import type { FeedConsumptionMonthly, ProductionRecord, Sale, SaleType } from '../types';

function sale(type: SaleType, quantity: number, date = '2026-07-20'): Sale {
  return {
    id: `${type}-${quantity}-${date}`,
    organization_id: 'org',
    customer_id: null,
    date,
    type,
    quantity,
    price_per_unit: 1,
    total_price: quantity,
    notes: '',
    created_at: `${date}T15:00:00.000Z`,
  };
}

function emptyPurchases(): Record<MapleStockItemKey, number> {
  return { maple: 0, docena: 0, media_docena: 0 };
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

check('maple genérico sin stock → Sin clasificar 0 (piso como Panel)', () => {
  const stock = computeEggStock([], [sale('maple', 1)]);
  assert.equal(stock.sin_clasificar, 0);
  assert.equal(stock.grande, 0);
});

check('maple_grande sin stock → Grande 0 (nunca negativo)', () => {
  const stock = computeEggStock([], [sale('maple_grande', 1)]);
  assert.equal(stock.grande, 0);
  assert.equal(stock.sin_clasificar, 0);
});

check('docena → Sin clasificar −12 vía residual; packaging Docena −1', () => {
  const production: ProductionRecord[] = [
    {
      id: 'u1',
      organization_id: 'org',
      gallinero_id: 'g1',
      date: '2026-07-21',
      eggs_count: 50,
      broken_dirty_eggs_count: 0,
      poultry_count: 50,
      laying_percentage: 0,
      eggs_large: null,
      eggs_medium: null,
      eggs_small: null,
      created_at: '2026-07-21T08:00:00.000Z',
    },
  ];
  const eggs = computeEggStock(production, [sale('docena', 1)]);
  const maples = computeMapleStock(emptyPurchases(), [sale('docena', 1)]);
  assert.equal(eggs.sin_clasificar, 38);
  assert.equal(maples.docena, -1);
  assert.equal(maples.maple, 0);
});

check('media_docena → packaging Media Docena −1', () => {
  const production: ProductionRecord[] = [
    {
      id: 'u2',
      organization_id: 'org',
      gallinero_id: 'g1',
      date: '2026-07-21',
      eggs_count: 20,
      broken_dirty_eggs_count: 0,
      poultry_count: 50,
      laying_percentage: 0,
      eggs_large: null,
      eggs_medium: null,
      eggs_small: null,
      created_at: '2026-07-21T08:00:00.000Z',
    },
  ];
  const eggs = computeEggStock(production, [sale('media_docena', 1)]);
  const maples = computeMapleStock(emptyPurchases(), [sale('media_docena', 1)]);
  assert.equal(eggs.sin_clasificar, 14);
  assert.equal(maples.media_docena, -1);
});

check('pack15 → Sin clasificar residual; Maple packaging −1', () => {
  const production: ProductionRecord[] = [
    {
      id: 'u3',
      organization_id: 'org',
      gallinero_id: 'g1',
      date: '2026-07-21',
      eggs_count: 40,
      broken_dirty_eggs_count: 0,
      poultry_count: 50,
      laying_percentage: 0,
      eggs_large: null,
      eggs_medium: null,
      eggs_small: null,
      created_at: '2026-07-21T08:00:00.000Z',
    },
  ];
  const eggs = computeEggStock(production, [sale('pack15', 1)]);
  const maples = computeMapleStock({ maple: 5, docena: 0, media_docena: 0 }, [sale('pack15', 1)]);
  assert.equal(eggs.sin_clasificar, 25);
  assert.equal(maples.maple, 4);
});

check('producción residual a Sin clasificar', () => {
  const production: ProductionRecord[] = [
    {
      id: '1',
      organization_id: 'org',
      gallinero_id: 'g1',
      date: '2026-07-21',
      eggs_count: 100,
      broken_dirty_eggs_count: 0,
      poultry_count: 50,
      laying_percentage: 0,
      eggs_large: 40,
      eggs_medium: 30,
      eggs_small: 10,
      created_at: '2026-07-21T08:00:00.000Z',
    },
  ];
  const stock = computeEggStock(production, []);
  assert.equal(stock.grande, 40);
  assert.equal(stock.mediano, 30);
  assert.equal(stock.chico, 10);
  assert.equal(stock.sin_clasificar, 20);
});

check('sobreventa maple_chico: Chico→0 y excedente sale de Sin clasificar', () => {
  // 30 Chico + 50 Sin clasificar; vendo 60 Chico (2 maples) forzando guardado.
  // Igual que Panel: Chico=0, Sin clasificar=20 (50−30 de excedente).
  const production: ProductionRecord[] = [
    {
      id: 'ov1',
      organization_id: 'org',
      gallinero_id: 'g1',
      date: '2026-07-21',
      eggs_count: 80,
      broken_dirty_eggs_count: 0,
      poultry_count: 50,
      laying_percentage: 0,
      eggs_large: 0,
      eggs_medium: 0,
      eggs_small: 30,
      created_at: '2026-07-21T08:00:00.000Z',
    },
  ];
  const stock = computeEggStock(production, [sale('maple_chico', 2)]);
  assert.equal(stock.chico, 0);
  assert.equal(stock.grande, 0);
  assert.equal(stock.mediano, 0);
  assert.equal(stock.sin_clasificar, 20);
});

check('sobreventa maple_chico solo con Chico (sin balde genérico): ambos en 0', () => {
  const production: ProductionRecord[] = [
    {
      id: 'ov2',
      organization_id: 'org',
      gallinero_id: 'g1',
      date: '2026-07-21',
      eggs_count: 30,
      broken_dirty_eggs_count: 0,
      poultry_count: 50,
      laying_percentage: 0,
      eggs_large: 0,
      eggs_medium: 0,
      eggs_small: 30,
      created_at: '2026-07-21T08:00:00.000Z',
    },
  ];
  const stock = computeEggStock(production, [sale('maple_chico', 2)]);
  assert.equal(stock.chico, 0);
  assert.equal(stock.sin_clasificar, 0);
});

check('alimento: compras − consumo', () => {
  assert.equal(computeFeedStockKg(100, 40), 60);
});

check('días restantes: meses cerrados × aves (no mes en curso)', () => {
  // Junio cerrado: 300 kg / 30 días / 100 aves = 100 g/ave/día
  // Stock 50 kg, 100 aves → consumo diario 10 kg → 5 días
  const consumptions: FeedConsumptionMonthly[] = [
    {
      id: '1',
      organization_id: 'org',
      gallinero_id: null,
      year: 2026,
      month: 6,
      kg_consumed: 300,
      notes: null,
      hens_snapshot: 100,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    {
      id: '2',
      organization_id: 'org',
      gallinero_id: null,
      year: 2026,
      month: 7,
      kg_consumed: 9999, // mes en curso: debe ignorarse
      notes: null,
      hens_snapshot: 100,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
  ];
  const est = estimateFeedDaysRemaining(50, consumptions, 100, new Date(2026, 6, 23));
  assert.equal(est.gramsSource, 'history');
  assert.ok(Math.abs(est.gramsPerHenDay - 100) < 0.01);
  assert.ok(est.daysRemaining != null && Math.abs(est.daysRemaining - 5) < 0.01);
});

check('días restantes: sin historial usa default 117 g', () => {
  const est = estimateFeedDaysRemaining(11.7, [], 100, new Date(2026, 6, 23));
  assert.equal(est.gramsSource, 'default');
  assert.equal(est.gramsPerHenDay, 117);
  // 117g * 100 aves / 1000 = 11.7 kg/día → 11.7/11.7 = 1 día
  assert.ok(est.daysRemaining != null && Math.abs(est.daysRemaining - 1) < 0.01);
});

check('historial implausible (13 g) → default 117 (caso Granja de Prueba)', () => {
  // Julio cerrado: 250 kg / 31 días / 600 aves ≈ 13.4 g — fuera de rango → default
  const consumptions: FeedConsumptionMonthly[] = [
    {
      id: 'gp',
      organization_id: 'org',
      gallinero_id: null,
      year: 2026,
      month: 7,
      kg_consumed: 250,
      notes: null,
      hens_snapshot: 600,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
  ];
  const months = aggregateClosedMonthFeedRates(consumptions, 600, new Date(2026, 7, 1));
  assert.equal(months.length, 1);
  assert.ok(Math.abs(months[0].gramsPerHenDay - 250000 / (31 * 600)) < 0.01);
  const est = estimateFeedDaysRemaining(100, consumptions, 600, new Date(2026, 7, 1));
  assert.equal(est.gramsSource, 'default');
  assert.equal(est.gramsPerHenDay, 117);
  // 100 kg / (117*600/1000) ≈ 1.42 días
  assert.ok(est.daysRemaining != null && Math.abs(est.daysRemaining! - 100 / 70.2) < 0.05);
});

check('agrega mes: prioriza declaración org sobre gallineros', () => {
  const consumptions: FeedConsumptionMonthly[] = [
    {
      id: 'org',
      organization_id: 'org',
      gallinero_id: null,
      year: 2026,
      month: 6,
      kg_consumed: 2100,
      notes: null,
      hens_snapshot: 600,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'g1',
      organization_id: 'org',
      gallinero_id: 'gall-1',
      year: 2026,
      month: 6,
      kg_consumed: 700,
      notes: null,
      hens_snapshot: 200,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
  ];
  const months = aggregateClosedMonthFeedRates(consumptions, 600, new Date(2026, 6, 15));
  assert.equal(months.length, 1);
  assert.equal(months[0].kgConsumed, 2100);
  assert.equal(months[0].hens, 600);
  // (2100*1000)/(30*600) = 116.67 g
  assert.ok(Math.abs(months[0].gramsPerHenDay - 116.666) < 0.01);
});

check('estimateDaysFromFeedKg', () => {
  assert.equal(estimateDaysFromFeedKg(70.2, 117, 600), 1);
  assert.equal(estimateDaysFromFeedKg(0, 117, 600), null);
});

check('validación huevos: insuficiente', () => {
  const stock = { grande: 10, mediano: 0, chico: 0, sin_clasificar: 0 };
  const impact = eggImpactForSale('maple_grande', 1);
  const available = availableEggStockForSale(stock, 'maple_grande', 1, null);
  assert.equal(impact.eggs, 30);
  assert.equal(available, 10);
  assert.ok(available < impact.eggs);
});

check('validación maples: toast case', () => {
  const checkMaple = availableMapleStockForSale(
    { maple: 0, docena: 2, media_docena: 0 },
    'maple',
    1,
    null
  );
  assert.ok(checkMaple);
  assert.equal(checkMaple!.available, 0);
  assert.equal(checkMaple!.needed, 1);
});

check('impacto maple packaging', () => {
  assert.deepEqual(mapleImpactForSale('maple_mediano', 2), { key: 'maple', units: 2 });
  assert.deepEqual(mapleImpactForSale('docena', 3), { key: 'docena', units: 3 });
});

check('baseline null = histórico (retrocompatible)', () => {
  const purchased = { maple: 10, docena: 0, media_docena: 0 };
  const sales = [sale('maple', 3)];
  assert.deepEqual(
    computeMapleStockFromBaseline(purchased, sales, null),
    computeMapleStock(purchased, sales)
  );
});

check('baseline + movimientos desde la fecha', () => {
  const baseline = { maple: 100, docena: 20, media_docena: 5 };
  const purchasedAfter = { maple: 10, docena: 0, media_docena: 0 };
  const salesAfter = [sale('maple', 4, '2026-08-03'), sale('docena', 2, '2026-08-03')];
  const stock = computeMapleStockFromBaseline(purchasedAfter, salesAfter, baseline);
  assert.equal(stock.maple, 106); // 100 + 10 - 4
  assert.equal(stock.docena, 18); // 20 - 2
  assert.equal(stock.media_docena, 5);
});

check('dateOnOrAfter inclusive', () => {
  assert.equal(dateOnOrAfter('2026-08-03', '2026-08-03'), true);
  assert.equal(dateOnOrAfter('2026-08-02', '2026-08-03'), false);
  assert.equal(dateOnOrAfter('2026-08-04', '2026-08-03'), true);
});

check('consumo stock: no doblecuenta org + gallinero del mismo mes', () => {
  const rows: FeedConsumptionMonthly[] = [
    {
      id: '1',
      organization_id: 'org',
      gallinero_id: null,
      year: 2026,
      month: 7,
      kg_consumed: 525,
      notes: null,
      hens_snapshot: 147,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    },
    {
      id: '2',
      organization_id: 'org',
      gallinero_id: 'g1',
      year: 2026,
      month: 7,
      kg_consumed: 525,
      notes: null,
      hens_snapshot: 147,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    },
  ];
  assert.equal(sumDeclaredFeedConsumptionKg(rows), 525);
  assert.equal(computeFeedStockKg(1050, sumDeclaredFeedConsumptionKg(rows)), 525);
});

check('consumo stock: sin org suma gallineros', () => {
  const rows: FeedConsumptionMonthly[] = [
    {
      id: '1',
      organization_id: 'org',
      gallinero_id: 'g1',
      year: 2026,
      month: 6,
      kg_consumed: 200,
      notes: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: '2',
      organization_id: 'org',
      gallinero_id: 'g2',
      year: 2026,
      month: 6,
      kg_consumed: 150,
      notes: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
  ];
  assert.equal(sumDeclaredFeedConsumptionKg(rows), 350);
});

console.log(`\n${passed} tests passed`);
if (!process.exitCode) console.log('All inventory auto-stock tests OK');
