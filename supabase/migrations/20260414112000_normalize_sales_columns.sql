-- Normalize sales schema to frontend canonical fields:
-- date, type, quantity, price_per_unit, total_price, notes

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS price_per_unit numeric,
ADD COLUMN IF NOT EXISTS total_price numeric,
ADD COLUMN IF NOT EXISTS notes text;

-- If legacy columns exist, copy data into canonical columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'unit_price'
  ) THEN
    EXECUTE 'UPDATE public.sales SET price_per_unit = COALESCE(price_per_unit, unit_price)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'total_amount'
  ) THEN
    EXECUTE 'UPDATE public.sales SET total_price = COALESCE(total_price, total_amount)';
  END IF;
END $$;

-- Backfill nulls to satisfy NOT NULL safely.
UPDATE public.sales
SET
  price_per_unit = COALESCE(price_per_unit, 0),
  total_price = COALESCE(total_price, COALESCE(quantity, 0) * COALESCE(price_per_unit, 0))
WHERE price_per_unit IS NULL
   OR total_price IS NULL;

ALTER TABLE public.sales
ALTER COLUMN price_per_unit SET NOT NULL,
ALTER COLUMN total_price SET NOT NULL;
