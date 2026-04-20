-- User profiles + role system
-- Roles: admin | operator

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'operator')),
  created_at timestamptz DEFAULT now()
);

-- Backfill profiles for existing users already linked to organizations.
INSERT INTO public.profiles (id, role)
SELECT om.user_id, 'admin'
FROM public.organization_members om
LEFT JOIN public.profiles p ON p.id = om.user_id
WHERE p.id IS NULL;

-- New users get admin by default.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_self_or_org" ON public.profiles;
CREATE POLICY "profiles_select_self_or_org"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members me
      JOIN public.organization_members them
        ON me.organization_id = them.organization_id
      WHERE me.user_id = auth.uid()
        AND them.user_id = profiles.id
    )
  );

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members me
      JOIN public.organization_members them
        ON me.organization_id = them.organization_id
      JOIN public.profiles pme
        ON pme.id = me.user_id
      WHERE me.user_id = auth.uid()
        AND pme.role = 'admin'
        AND them.user_id = profiles.id
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members me
      JOIN public.organization_members them
        ON me.organization_id = them.organization_id
      JOIN public.profiles pme
        ON pme.id = me.user_id
      WHERE me.user_id = auth.uid()
        AND pme.role = 'admin'
        AND them.user_id = profiles.id
    )
  );

-- Allow org users to list users from the same organization.
DROP POLICY IF EXISTS "organization_members_select_org" ON public.organization_members;
CREATE POLICY "organization_members_select_org"
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
