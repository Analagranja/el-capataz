-- Signup: single AFTER INSERT trigger (org + membership + profile) to avoid ordering/races
-- between organization and profile triggers. Adds RAISE LOG for Postgres logs (Supabase → Logs).
-- Optional RPC validate_invite_code for fast client-side feedback before auth.signUp.

-- 1) Remove old triggers (keep names free for email-only update trigger below).
DROP TRIGGER IF EXISTS on_auth_user_created_organization ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated_profile ON auth.users;

-- 2) New combined handler (INSERT only).
CREATE OR REPLACE FUNCTION public.handle_new_user_after_insert()
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
  new_role text;
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
    SELECT o.id INTO target_org
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

    new_role := 'operator';
  ELSE
    farm_name := NULLIF(trim(COALESCE(meta ->> 'farm_name', meta ->> 'farmName', '')), '');
    IF farm_name IS NULL THEN
      farm_name := 'Mi granja';
    END IF;

    INSERT INTO public.organizations (name, invite_code)
    VALUES (
      farm_name,
      upper('CAP-' || to_char(now(), 'YYYY') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12))
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (user_id, organization_id)
    VALUES (NEW.id, new_org_id);

    new_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, role, email)
  VALUES (NEW.id, new_role, NEW.email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role;

  RAISE LOG 'handle_new_user_after_insert: ok user_id=% role=%', NEW.id::text, new_role;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user_after_insert: ERROR user_id=% sqlstate=% message=%',
      NEW.id::text, SQLSTATE, SQLERRM;
    RAISE;
END;
$$;

CREATE TRIGGER on_auth_user_created_setup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_after_insert();

-- 3) Email sync on auth.users update (does not touch role).
CREATE OR REPLACE FUNCTION public.sync_profile_email_on_auth_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_updated_profile
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_profile_email_on_auth_update();

-- 4) Pre-check for UI (anon can call; only returns boolean).
CREATE OR REPLACE FUNCTION public.validate_invite_code(p_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE upper(trim(o.invite_code)) = upper(trim(p_code))
  );
$$;

REVOKE ALL ON FUNCTION public.validate_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;

-- 5) Drop superseded signup functions (triggers already removed).
DROP FUNCTION IF EXISTS public.handle_new_user_organization();
DROP FUNCTION IF EXISTS public.sync_profile_from_auth_user();
