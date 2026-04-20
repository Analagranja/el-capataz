-- Add email to profiles and allow admin to remove organization members.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- Keep profile email synced from auth.users on signup and updates.
CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, email)
  VALUES (NEW.id, 'admin', NEW.email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_profile_from_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_updated_profile ON auth.users;
CREATE TRIGGER on_auth_user_updated_profile
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_profile_from_auth_user();

-- Backfill emails for existing users.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND (p.email IS NULL OR p.email = '');

-- Helper: can current user (admin) manage target member in same org?
CREATE OR REPLACE FUNCTION public.can_manage_org_member(target_user uuid, target_org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.profiles pme ON pme.id = me.user_id
    WHERE me.user_id = (SELECT auth.uid())
      AND pme.role = 'admin'
      AND me.organization_id = target_org
  )
  AND EXISTS (
    SELECT 1
    FROM public.organization_members them
    WHERE them.user_id = target_user
      AND them.organization_id = target_org
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_org_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "organization_members_delete_admin_same_org" ON public.organization_members;
CREATE POLICY "organization_members_delete_admin_same_org"
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    public.can_manage_org_member(user_id, organization_id)
    AND user_id <> (SELECT auth.uid())
  );
