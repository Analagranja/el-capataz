-- Apertura de stock de alimento (una vez por organización).
-- Si no hay fila, Inventario usa el cálculo histórico: compras − consumo declarado.

CREATE TABLE IF NOT EXISTS public.feed_stock_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  baseline_date date NOT NULL,
  stock_kg numeric NOT NULL DEFAULT 0
    CHECK (stock_kg >= 0),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_stock_baselines_org_unique UNIQUE (organization_id)
);

COMMENT ON TABLE public.feed_stock_baselines IS
  'Línea base de alimento por organización. Stock = baseline_kg + compras ≥ fecha − consumo (meses ≥ mes de corte).';

CREATE INDEX IF NOT EXISTS idx_feed_stock_baselines_org
  ON public.feed_stock_baselines (organization_id);

ALTER TABLE public.feed_stock_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_stock_baselines_select_org" ON public.feed_stock_baselines;
DROP POLICY IF EXISTS "feed_stock_baselines_insert_org" ON public.feed_stock_baselines;
DROP POLICY IF EXISTS "feed_stock_baselines_update_org" ON public.feed_stock_baselines;
DROP POLICY IF EXISTS "feed_stock_baselines_delete_org" ON public.feed_stock_baselines;

CREATE POLICY "feed_stock_baselines_select_org"
  ON public.feed_stock_baselines FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "feed_stock_baselines_insert_org"
  ON public.feed_stock_baselines FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "feed_stock_baselines_update_org"
  ON public.feed_stock_baselines FOR UPDATE TO authenticated
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

CREATE POLICY "feed_stock_baselines_delete_org"
  ON public.feed_stock_baselines FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
