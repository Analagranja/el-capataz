-- Tipo de registro de consumo (bolsas vs granel) y trazabilidad opcional.

ALTER TABLE public.feed_logs
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'bolsas';

ALTER TABLE public.feed_logs
  ADD COLUMN IF NOT EXISTS cantidad_bolsas integer NULL;

ALTER TABLE public.feed_logs
  ADD COLUMN IF NOT EXISTS kg_por_bolsa numeric NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_logs_tipo_check'
  ) THEN
    ALTER TABLE public.feed_logs
      ADD CONSTRAINT feed_logs_tipo_check CHECK (tipo IN ('bolsas', 'granel'));
  END IF;
END $$;

COMMENT ON COLUMN public.feed_logs.tipo IS 'bolsas | granel — cómo se ingresó el total kg';
COMMENT ON COLUMN public.feed_logs.cantidad_bolsas IS 'Solo si tipo = bolsas; opcional para trazabilidad';
COMMENT ON COLUMN public.feed_logs.kg_por_bolsa IS 'Solo si tipo = bolsas; opcional para trazabilidad';
