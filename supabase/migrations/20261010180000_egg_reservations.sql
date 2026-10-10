-- Reservas de huevos (anotación previa a la venta). Tabla nueva; no altera sales.

CREATE TABLE IF NOT EXISTS public.egg_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers (id) ON DELETE SET NULL,
  sale_type text NOT NULL
    CHECK (
      sale_type IN (
        'maple',
        'docena',
        'media_docena',
        'pack15',
        'maple_grande',
        'maple_mediano',
        'maple_chico'
      )
    ),
  quantity integer NOT NULL
    CHECK (quantity >= 1),
  delivery_date date NULL,
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'entregada', 'cancelada')),
  converted_sale_id uuid NULL REFERENCES public.sales (id) ON DELETE SET NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.egg_reservations IS
  'Reservas de huevos por organización. Convertir en venta completa converted_sale_id; marcar entregada no toca sales.';

CREATE INDEX IF NOT EXISTS idx_egg_reservations_org
  ON public.egg_reservations (organization_id);

CREATE INDEX IF NOT EXISTS idx_egg_reservations_org_status
  ON public.egg_reservations (organization_id, status);

ALTER TABLE public.egg_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "egg_reservations_select_org" ON public.egg_reservations;
DROP POLICY IF EXISTS "egg_reservations_insert_org" ON public.egg_reservations;
DROP POLICY IF EXISTS "egg_reservations_update_org" ON public.egg_reservations;
DROP POLICY IF EXISTS "egg_reservations_delete_org" ON public.egg_reservations;

CREATE POLICY "egg_reservations_select_org"
  ON public.egg_reservations FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "egg_reservations_insert_org"
  ON public.egg_reservations FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "egg_reservations_update_org"
  ON public.egg_reservations FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "egg_reservations_delete_org"
  ON public.egg_reservations FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
