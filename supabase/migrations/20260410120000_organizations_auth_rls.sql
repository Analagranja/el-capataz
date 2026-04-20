/*
  Organizations, membership, tenant columns, signup trigger, RLS.
  Run after create_poultry_farm_schema. Backfills existing rows into a migration org.
*/

-- 1) Core tables
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org ON public.organization_members (organization_id);

-- 2) Tenant column on domain tables
ALTER TABLE public.gallineros ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);

-- 3) Backfill existing data (pre-auth rows)
DO $$
DECLARE
  mig_org_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.gallineros WHERE organization_id IS NULL
    UNION ALL
    SELECT 1 FROM public.production_records WHERE organization_id IS NULL
    UNION ALL
    SELECT 1 FROM public.sales WHERE organization_id IS NULL
    UNION ALL
    SELECT 1 FROM public.events WHERE organization_id IS NULL
  ) THEN
    INSERT INTO public.organizations (name)
    VALUES ('Granja (datos previos)')
    RETURNING id INTO mig_org_id;

    UPDATE public.gallineros SET organization_id = mig_org_id WHERE organization_id IS NULL;

    UPDATE public.production_records pr
    SET organization_id = g.organization_id
    FROM public.gallineros g
    WHERE pr.gallinero_id = g.id AND pr.organization_id IS NULL;

    UPDATE public.sales SET organization_id = mig_org_id WHERE organization_id IS NULL;
    UPDATE public.events e
    SET organization_id = g.organization_id
    FROM public.gallineros g
    WHERE e.gallinero_id = g.id AND e.organization_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.gallineros ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.production_records ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.events ALTER COLUMN organization_id SET NOT NULL;

-- 4) New user → organization + membership (farm name from raw_user_meta_data.farm_name)
CREATE OR REPLACE FUNCTION public.handle_new_user_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  farm_name text;
  new_org_id uuid;
BEGIN
  farm_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'farm_name', '')), '');
  IF farm_name IS NULL THEN
    farm_name := 'Mi granja';
  END IF;

  INSERT INTO public.organizations (name) VALUES (farm_name) RETURNING id INTO new_org_id;
  INSERT INTO public.organization_members (user_id, organization_id) VALUES (NEW.id, new_org_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_organization ON auth.users;
CREATE TRIGGER on_auth_user_created_organization
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_organization();

-- 5) RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on gallineros" ON public.gallineros;
DROP POLICY IF EXISTS "Allow public insert on gallineros" ON public.gallineros;
DROP POLICY IF EXISTS "Allow public update on gallineros" ON public.gallineros;
DROP POLICY IF EXISTS "Allow public delete on gallineros" ON public.gallineros;

DROP POLICY IF EXISTS "Allow public read on production_records" ON public.production_records;
DROP POLICY IF EXISTS "Allow public insert on production_records" ON public.production_records;
DROP POLICY IF EXISTS "Allow public update on production_records" ON public.production_records;
DROP POLICY IF EXISTS "Allow public delete on production_records" ON public.production_records;

DROP POLICY IF EXISTS "Allow public read on sales" ON public.sales;
DROP POLICY IF EXISTS "Allow public insert on sales" ON public.sales;
DROP POLICY IF EXISTS "Allow public update on sales" ON public.sales;
DROP POLICY IF EXISTS "Allow public delete on sales" ON public.sales;

DROP POLICY IF EXISTS "Allow public read on events" ON public.events;
DROP POLICY IF EXISTS "Allow public insert on events" ON public.events;
DROP POLICY IF EXISTS "Allow public update on events" ON public.events;
DROP POLICY IF EXISTS "Allow public delete on events" ON public.events;

CREATE POLICY "organizations_select_member"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "organization_members_select_own"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "gallineros_select_org"
  ON public.gallineros FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "gallineros_insert_org"
  ON public.gallineros FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "gallineros_update_org"
  ON public.gallineros FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "gallineros_delete_org"
  ON public.gallineros FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "production_select_org"
  ON public.production_records FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "production_insert_org"
  ON public.production_records FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "production_update_org"
  ON public.production_records FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "production_delete_org"
  ON public.production_records FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sales_select_org"
  ON public.sales FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sales_insert_org"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sales_update_org"
  ON public.sales FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sales_delete_org"
  ON public.sales FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "events_select_org"
  ON public.events FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "events_insert_org"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "events_update_org"
  ON public.events FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "events_delete_org"
  ON public.events FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
