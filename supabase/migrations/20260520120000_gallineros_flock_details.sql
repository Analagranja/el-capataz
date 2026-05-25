-- Detalle opcional del lote por gallinero + registro de mortalidad

ALTER TABLE public.gallineros
  ADD COLUMN IF NOT EXISTS birth_date date NULL,
  ADD COLUMN IF NOT EXISTS breed text NULL,
  ADD COLUMN IF NOT EXISTS feather_color text NULL,
  ADD COLUMN IF NOT EXISTS band_number text NULL,
  ADD COLUMN IF NOT EXISTS band_color text NULL,
  ADD COLUMN IF NOT EXISTS supplier text NULL,
  ADD COLUMN IF NOT EXISTS notes_flock text NULL,
  ADD COLUMN IF NOT EXISTS average_weight_kg numeric NULL;

CREATE TABLE IF NOT EXISTS public.gallinero_mortality_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  gallinero_id uuid NOT NULL REFERENCES public.gallineros (id) ON DELETE CASCADE,
  date date NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  cause text NULL,
  notes text NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallinero_mortality_logs_org_gallinero_date
  ON public.gallinero_mortality_logs (organization_id, gallinero_id, date DESC);

ALTER TABLE public.gallinero_mortality_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallinero_mortality_logs_select_org" ON public.gallinero_mortality_logs;
CREATE POLICY "gallinero_mortality_logs_select_org"
  ON public.gallinero_mortality_logs FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gallinero_mortality_logs_insert_org" ON public.gallinero_mortality_logs;
CREATE POLICY "gallinero_mortality_logs_insert_org"
  ON public.gallinero_mortality_logs FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gallinero_mortality_logs_update_org" ON public.gallinero_mortality_logs;
CREATE POLICY "gallinero_mortality_logs_update_org"
  ON public.gallinero_mortality_logs FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "gallinero_mortality_logs_delete_org" ON public.gallinero_mortality_logs;
CREATE POLICY "gallinero_mortality_logs_delete_org"
  ON public.gallinero_mortality_logs FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
