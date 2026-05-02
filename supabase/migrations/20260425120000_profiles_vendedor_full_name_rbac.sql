-- RBAC: rol vendedor, nombre visible opcional, invitaciones con rol vendedor.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS invite_default_role text NOT NULL DEFAULT 'operator';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'operator'::text, 'vendedor'::text]));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_invite_default_role_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_invite_default_role_check
  CHECK (invite_default_role = ANY (ARRAY['admin'::text, 'operator'::text, 'vendedor'::text]));

CREATE OR REPLACE FUNCTION public.handle_new_user_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  farm_name text;
  invite_raw text;
  invite_norm text;
  target_org uuid;
  new_org_id uuid;
  new_role text;
  assign_role text;
  meta jsonb;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  invite_raw := COALESCE(
    NULLIF(trim(meta ->> 'invite_code'), ''),
    NULLIF(trim(meta ->> 'inviteCode'), '')
  );
  invite_norm := upper(trim(COALESCE(invite_raw, '')));

  RAISE LOG 'handle_new_user_after_insert: user_id=% invite_nonempty=%',
    NEW.id::text,
    (invite_norm <> '');

  IF invite_norm <> '' THEN
    SELECT o.id, o.invite_default_role
    INTO target_org, assign_role
    FROM public.organizations o
    WHERE upper(trim(o.invite_code)) = invite_norm
    LIMIT 1;

    IF target_org IS NULL THEN
      RAISE LOG 'handle_new_user_after_insert: INVITE_NOT_FOUND user_id=% normalized_len=%',
        NEW.id::text,
        length(invite_norm);
      RAISE EXCEPTION 'INVITE_CODE_INVALID'
        USING ERRCODE = 'P0001',
              HINT = 'No existe una organización con ese código de invitación.';
    END IF;

    INSERT INTO public.organization_members (user_id, organization_id)
    VALUES (NEW.id, target_org);

    new_role := CASE assign_role
      WHEN 'admin' THEN 'admin'
      WHEN 'vendedor' THEN 'vendedor'
      ELSE 'operator'
    END;
  ELSE
    farm_name := NULLIF(trim(COALESCE(meta ->> 'farm_name', meta ->> 'farmName', '')), '');
    IF farm_name IS NULL THEN
      farm_name := 'Mi granja';
    END IF;

    INSERT INTO public.organizations (name, invite_code, invite_default_role)
    VALUES (
      farm_name,
      upper('CAP-' || to_char(now(), 'YYYY') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12)),
      'operator'
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (user_id, organization_id)
    VALUES (NEW.id, new_org_id);

    new_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, new_role)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role;

  RAISE LOG 'handle_new_user_after_insert: ok user_id=% role=%', NEW.id::text, new_role;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user_after_insert: ERROR user_id=% sqlstate=% message=%',
      NEW.id::text, SQLSTATE, SQLERRM;
    RAISE;
END;
$$;

ALTER FUNCTION public.handle_new_user_after_insert() OWNER TO postgres;
