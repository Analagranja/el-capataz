-- Alinear columna quantity_kg si la tabla expenses existía con otro esquema (p. ej. solo "quantity").

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS quantity_kg numeric;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'quantity'
  ) THEN
    UPDATE public.expenses
    SET quantity_kg = COALESCE(quantity_kg, quantity, 0);
  END IF;
END $$;

UPDATE public.expenses
SET quantity_kg = COALESCE(quantity_kg, 0)
WHERE quantity_kg IS NULL;

ALTER TABLE public.expenses
  ALTER COLUMN quantity_kg SET DEFAULT 0;

ALTER TABLE public.expenses
  ALTER COLUMN quantity_kg SET NOT NULL;
