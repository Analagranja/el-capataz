-- Apertura de stock de packaging (una vez por organización).
-- Si no hay fila, Inventario usa el cálculo histórico: compras − ventas (sin cambios).

CREATE TABLE IF NOT EXISTS public.packaging_stock_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  baseline_date date NOT NULL,
  maple integer NOT NULL DEFAULT 0
    CHECK (maple >= 0),
  docena integer NOT NULL DEFAULT 0
    CHECK (docena >= 0),
  media_docena integer NOT NULL DEFAULT 0
    CHECK (media_docena >= 0),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT packaging_stock_baselines_org_unique UNIQUE (organization_id)
);

COMMENT ON TABLE public.packaging_stock_baselines IS
  'Línea base de packaging por organización. Stock = baseline + compras ≥ fecha − ventas ≥ fecha.';

CREATE INDEX IF NOT EXISTS idx_packaging_stock_baselines_org
  ON public.packaging_stock_baselines (organization_id);

ALTER TABLE public.packaging_stock_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "packaging_stock_baselines_select_org" ON public.packaging_stock_baselines;
DROP POLICY IF EXISTS "packaging_stock_baselines_insert_org" ON public.packaging_stock_baselines;
DROP POLICY IF EXISTS "packaging_stock_baselines_update_org" ON public.packaging_stock_baselines;
DROP POLICY IF EXISTS "packaging_stock_baselines_delete_org" ON public.packaging_stock_baselines;

CREATE POLICY "packaging_stock_baselines_select_org"
  ON public.packaging_stock_baselines FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "packaging_stock_baselines_insert_org"
  ON public.packaging_stock_baselines FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "packaging_stock_baselines_update_org"
  ON public.packaging_stock_baselines FOR UPDATE TO authenticated
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

CREATE POLICY "packaging_stock_baselines_delete_org"
  ON public.packaging_stock_baselines FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
