-- Unify sales schema to a single source of truth.
-- Canonical columns after this migration:
--   sale_date, sale_type, quantity, unit_price, total_price, notes
-- Legacy compatibility source columns may exist in older deployments:
--   date, type, price_per_unit, total_amount

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_date date,
  ADD COLUMN IF NOT EXISTS sale_type text,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill date from legacy column if needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'date'
  ) THEN
    EXECUTE 'UPDATE public.sales SET sale_date = COALESCE(sale_date, date)';
  END IF;
END $$;

-- Backfill type from legacy column if needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'type'
  ) THEN
    EXECUTE 'UPDATE public.sales SET sale_type = COALESCE(sale_type, type)';
  END IF;
END $$;

-- Normalize sale_type values (including requested "media docena" cleanup).
UPDATE public.sales
SET sale_type = CASE
  WHEN sale_type IS NULL THEN NULL
  WHEN lower(trim(sale_type)) IN ('media docena', 'media_docena', 'media-docena', 'half dozen', 'half_dozen', 'half-dozen')
    THEN 'media_docena'
  WHEN lower(trim(sale_type)) IN ('maple', 'arce', 'bandeja', 'tray_30')
    THEN 'maple'
  WHEN lower(trim(sale_type)) IN ('docena', 'dozen')
    THEN 'docena'
  ELSE lower(replace(trim(sale_type), ' ', '_'))
END;

-- Fill invalid/null values with a safe default.
UPDATE public.sales
SET sale_type = 'docena'
WHERE sale_type IS NULL
   OR sale_type NOT IN ('maple', 'docena', 'media_docena');

-- Backfill unit_price and total_price from legacy columns if needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'price_per_unit'
  ) THEN
    EXECUTE 'UPDATE public.sales SET unit_price = COALESCE(unit_price, price_per_unit)';
  END IF;
END $$;

DO $$
BEGIN
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

UPDATE public.sales
SET
  sale_date = COALESCE(sale_date, CURRENT_DATE),
  unit_price = COALESCE(unit_price, 0),
  total_price = COALESCE(total_price, COALESCE(quantity, 0) * COALESCE(unit_price, 0)),
  notes = COALESCE(notes, '');

ALTER TABLE public.sales
  ALTER COLUMN sale_date SET NOT NULL,
  ALTER COLUMN sale_type SET NOT NULL,
  ALTER COLUMN unit_price SET NOT NULL,
  ALTER COLUMN total_price SET NOT NULL;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_type_check;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_type_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_sale_type_check
  CHECK (sale_type IN ('maple', 'docena', 'media_docena'));

-- Drop legacy type column to enforce a single source of truth.
ALTER TABLE public.sales DROP COLUMN IF EXISTS type;
