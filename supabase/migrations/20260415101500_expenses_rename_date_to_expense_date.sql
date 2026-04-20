-- PostgREST puede fallar con columna llamada "date" en algunos casos; unificamos a expense_date.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'date'
  ) THEN
    ALTER TABLE public.expenses RENAME COLUMN date TO expense_date;
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_expenses_org_date;

CREATE INDEX IF NOT EXISTS idx_expenses_org_expense_date
  ON public.expenses (organization_id, expense_date);
