-- Apertura de stock de huevos (una vez por organización).
-- Si no hay fila, Inventario usa el cálculo histórico: producción − ventas (sin cambios).

CREATE TABLE IF NOT EXISTS public.egg_stock_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  baseline_date date NOT NULL,
  grande integer NOT NULL DEFAULT 0
    CHECK (grande >= 0),
  mediano integer NOT NULL DEFAULT 0
    CHECK (mediano >= 0),
  chico integer NOT NULL DEFAULT 0
    CHECK (chico >= 0),
  sin_clasificar integer NOT NULL DEFAULT 0
    CHECK (sin_clasificar >= 0),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT egg_stock_baselines_org_unique UNIQUE (organization_id)
);

COMMENT ON TABLE public.egg_stock_baselines IS
  'Línea base de huevos por organización. Stock = baseline[tamaño] + producción ≥ fecha − ventas ≥ fecha (por tamaño).';

CREATE INDEX IF NOT EXISTS idx_egg_stock_baselines_org
  ON public.egg_stock_baselines (organization_id);

ALTER TABLE public.egg_stock_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "egg_stock_baselines_select_org" ON public.egg_stock_baselines;
DROP POLICY IF EXISTS "egg_stock_baselines_insert_org" ON public.egg_stock_baselines;
DROP POLICY IF EXISTS "egg_stock_baselines_update_org" ON public.egg_stock_baselines;
DROP POLICY IF EXISTS "egg_stock_baselines_delete_org" ON public.egg_stock_baselines;

CREATE POLICY "egg_stock_baselines_select_org"
  ON public.egg_stock_baselines FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "egg_stock_baselines_insert_org"
  ON public.egg_stock_baselines FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "egg_stock_baselines_update_org"
  ON public.egg_stock_baselines FOR UPDATE TO authenticated
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

CREATE POLICY "egg_stock_baselines_delete_org"
  ON public.egg_stock_baselines FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
