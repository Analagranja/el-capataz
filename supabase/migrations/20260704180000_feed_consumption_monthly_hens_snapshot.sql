ALTER TABLE public.feed_consumption_monthly
  ADD COLUMN IF NOT EXISTS hens_snapshot integer NULL;

COMMENT ON COLUMN public.feed_consumption_monthly.hens_snapshot IS 'Cantidad de aves al declarar el consumo del mes';
