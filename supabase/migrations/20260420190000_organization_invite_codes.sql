-- Invite codes: operators join existing org via metadata.invite_code on signup.
-- Admins keep default signup (new org + admin). Invalid non-empty invite aborts signup.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS invite_code text;

-- Readable unique codes for existing organizations (one-time backfill).
UPDATE public.organizations o
SET invite_code = upper('CAP-' || to_char(coalesce(o.created_at, now()), 'YYYY') || '-' || left(replace(o.id::text, '-', ''), 8))
WHERE invite_code IS NULL;

-- New user → either join org by invite_code or create new org (farm_name).
CREATE OR REPLACE FUNCTION public.handle_new_user_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  farm_name text;
  invite_raw text;
  invite_norm text;
  target_org uuid;
  new_org_id uuid;
BEGIN
  invite_raw := COALESCE(NEW.raw_user_meta_data ->> 'invite_code', '');
  invite_norm := upper(trim(invite_raw));

  IF invite_norm <> '' THEN
    SELECT o.id INTO target_org
    FROM public.organizations o
    WHERE upper(trim(o.invite_code)) = invite_norm
    LIMIT 1;

    IF target_org IS NULL THEN
      RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.organization_members (user_id, organization_id)
    VALUES (NEW.id, target_org);
    RETURN NEW;
  END IF;

  farm_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'farm_name', '')), '');
  IF farm_name IS NULL THEN
    farm_name := 'Mi granja';
  END IF;

  INSERT INTO public.organizations (name, invite_code)
  VALUES (
    farm_name,
    upper('CAP-' || to_char(now(), 'YYYY') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12))
  )
  RETURNING id INTO new_org_id;
  INSERT INTO public.organization_members (user_id, organization_id) VALUES (NEW.id, new_org_id);
  RETURN NEW;
END;
$$;

ALTER TABLE public.organizations
  ALTER COLUMN invite_code SET NOT NULL;

DROP INDEX IF EXISTS organizations_invite_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_invite_code_unique
  ON public.organizations (invite_code);

-- Signup: operator if invite_code was provided (validated by org trigger); else admin.
CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_role text;
BEGIN
  new_role := CASE
    WHEN NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'invite_code', '')), '') IS NOT NULL THEN 'operator'
    ELSE 'admin'
  END;

  INSERT INTO public.profiles (id, role, email)
  VALUES (NEW.id, new_role, NEW.email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- Admins can update their organization (name, invite_code).
DROP POLICY IF EXISTS "organizations_update_admin" ON public.organizations;
CREATE POLICY "organizations_update_admin"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      JOIN public.profiles p ON p.id = om.user_id
      WHERE om.user_id = auth.uid()
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      JOIN public.profiles p ON p.id = om.user_id
      WHERE om.user_id = auth.uid()
        AND p.role = 'admin'
    )
  );

GRANT UPDATE ON public.organizations TO authenticated;
