-- Recordatorios de sanidad: próxima aplicación y estado del recordatorio.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reminder_date date,
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.reminder_date IS 'Fecha de la próxima aplicación (vacunación, vitaminas, medicación).';
COMMENT ON COLUMN public.events.completed IS 'Si el recordatorio fue marcado como realizado.';
