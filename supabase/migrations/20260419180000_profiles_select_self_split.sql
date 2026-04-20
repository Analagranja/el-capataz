-- Asegurar que leer el propio perfil (rol) no dependa de is_admin_user().
-- Dos políticas SELECT permisivas se combinan con OR en PostgreSQL.

DROP POLICY IF EXISTS "profiles_select_safe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self_or_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_org_as_admin" ON public.profiles;

CREATE POLICY "profiles_select_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles_select_org_as_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id <> (SELECT auth.uid())
    AND public.is_admin_user()
    AND public.shares_org_with_user(id)
  );
