CREATE TABLE IF NOT EXISTS public.feed_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  gallinero_id uuid NOT NULL REFERENCES public.gallineros (id) ON DELETE CASCADE,
  log_date date NOT NULL,
  kg_opened numeric NOT NULL CHECK (kg_opened > 0),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_logs_org_date
  ON public.feed_logs (organization_id, log_date);

CREATE INDEX IF NOT EXISTS idx_feed_logs_org_gallinero_date
  ON public.feed_logs (organization_id, gallinero_id, log_date);

ALTER TABLE public.feed_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_logs_select_org"
  ON public.feed_logs FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "feed_logs_insert_org"
  ON public.feed_logs FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "feed_logs_update_org"
  ON public.feed_logs FOR UPDATE TO authenticated
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

CREATE POLICY "feed_logs_delete_org"
  ON public.feed_logs FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
