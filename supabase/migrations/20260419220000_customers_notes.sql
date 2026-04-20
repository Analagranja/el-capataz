-- Notas por contacto en la agenda de clientes.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notes text;
