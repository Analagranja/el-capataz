CREATE TABLE IF NOT EXISTS public.feed_consumption_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  gallinero_id uuid NULL REFERENCES public.gallineros (id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  kg_consumed numeric NOT NULL CHECK (kg_consumed >= 0),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_consumption_monthly_unique UNIQUE NULLS NOT DISTINCT (
    organization_id,
    gallinero_id,
    year,
    month
  )
);

CREATE INDEX IF NOT EXISTS idx_feed_consumption_monthly_org_year_month
  ON public.feed_consumption_monthly (organization_id, year, month);

ALTER TABLE public.feed_consumption_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_consumption_monthly_select_org"
  ON public.feed_consumption_monthly FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "feed_consumption_monthly_insert_org"
  ON public.feed_consumption_monthly FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "feed_consumption_monthly_update_org"
  ON public.feed_consumption_monthly FOR UPDATE TO authenticated
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

CREATE POLICY "feed_consumption_monthly_delete_org"
  ON public.feed_consumption_monthly FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
