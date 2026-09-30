-- Cuenta corriente: marca de cobro por venta.
-- Aditivo: no altera columnas ni filas existentes más que el DEFAULT del nuevo campo.
-- Filas actuales quedan is_paid = true (no hay historial de pendientes).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.sales.is_paid IS
  'true = cobrada. false = pendiente de cobro (cuenta corriente).';
