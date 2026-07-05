ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS eggs_large integer NULL,
  ADD COLUMN IF NOT EXISTS eggs_medium integer NULL,
  ADD COLUMN IF NOT EXISTS eggs_small integer NULL;
