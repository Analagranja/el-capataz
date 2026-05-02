-- Al crear usuario: guardar full_name en profiles desde user_metadata (full_name, name, display_name, fullName).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

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
  display_name text;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  display_name := NULLIF(
    trim(
      COALESCE(
        NULLIF(trim(meta ->> 'full_name'), ''),
        NULLIF(trim(meta ->> 'fullName'), ''),
        NULLIF(trim(meta ->> 'name'), ''),
        NULLIF(trim(meta ->> 'display_name'), ''),
        NULLIF(trim(meta ->> 'displayName'), '')
      )
    ),
    ''
  );

  invite_raw := COALESCE(
    NULLIF(trim(meta ->> 'invite_code'), ''),
    NULLIF(trim(meta ->> 'inviteCode'), '')
  );
  invite_norm := upper(trim(COALESCE(invite_raw, '')));

  IF invite_norm <> '' THEN
    SELECT o.id, o.invite_default_role
    INTO target_org, assign_role
    FROM public.organizations o
    WHERE upper(trim(o.invite_code)) = invite_norm
    LIMIT 1;

    IF target_org IS NULL THEN
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

  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, new_role, display_name)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

ALTER FUNCTION public.handle_new_user_after_insert() OWNER TO postgres;
