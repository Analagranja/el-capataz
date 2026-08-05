-- Prorrateo opcional de gastos (no Alimento / no Maples) en el reporte financiero.
-- No cambia expense_date ni total_price: solo cómo se reparte el costo en Estadísticas.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS amortization_months integer NOT NULL DEFAULT 1
    CHECK (amortization_months >= 1 AND amortization_months <= 60);

COMMENT ON COLUMN public.expenses.amortization_months IS
  'Meses consecutivos (desde el mes de expense_date) en los que se reparte total_price para el reporte de costo de producción. Default 1 = todo en el mes de compra. Ignorado para Alimento y Maples / Packaging.';
