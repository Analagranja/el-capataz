-- Reparar / aplicar en SQL Editor de producción (idempotente).
-- Prorrateo opcional de gastos en el reporte financiero (Estadísticas / export).

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS amortization_months integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_amortization_months_check'
      AND conrelid = 'public.expenses'::regclass
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_amortization_months_check
      CHECK (amortization_months >= 1 AND amortization_months <= 60);
  END IF;
END $$;

COMMENT ON COLUMN public.expenses.amortization_months IS
  'Meses consecutivos (desde el mes de expense_date) en los que se reparte total_price para el reporte de costo de producción. Default 1 = todo en el mes de compra. Ignorado para Alimento y Maples / Packaging.';
