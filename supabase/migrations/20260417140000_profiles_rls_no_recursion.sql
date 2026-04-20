-- Fix infinite recursion on profiles RLS policies.
-- Uses SECURITY DEFINER helper functions with (select auth.uid())
-- so policies do not self-reference profiles recursively.

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_org_with_user(target_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members them
      ON me.organization_id = them.organization_id
    WHERE me.user_id = (SELECT auth.uid())
      AND them.user_id = target_user
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_org_with_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_select_self_or_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;

-- Self read, or admin read users in same organization.
CREATE POLICY "profiles_select_safe"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      public.is_admin_user()
      AND public.shares_org_with_user(id)
    )
  );

-- Only self profile insert (trigger handles normal creation anyway).
CREATE POLICY "profiles_insert_self_safe"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- Self update, or admin update users in same organization.
CREATE POLICY "profiles_update_self_or_admin_safe"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      public.is_admin_user()
      AND public.shares_org_with_user(id)
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR (
      public.is_admin_user()
      AND public.shares_org_with_user(id)
    )
  );
