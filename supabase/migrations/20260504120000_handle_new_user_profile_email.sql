-- Diagnóstico (SQL Editor, opcional):
-- SELECT trigger_name, event_manipulation, event_object_table, action_statement
-- FROM information_schema.triggers
-- WHERE trigger_schema = 'public' OR event_object_schema = 'auth'
-- ORDER BY trigger_name;
-- SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user_after_insert';
--
-- El trigger fallaba a menudo porque public.profiles incluye la columna email (migración
-- 20260417143000) y el flujo de sync espera rellenarla en el alta. Un INSERT solo con
-- (id, role, full_name) puede violar NOT NULL o reglas de negocio en DBs ajustadas a mano.
-- Incluimos NEW.email y normalizamos assign_role nulo en la rama por invitación.

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

    new_role := CASE COALESCE(assign_role, 'operator')
      WHEN 'admin' THEN 'admin'
      WHEN 'vendedor' THEN 'vendedor'
      ELSE 'operator'
    END;
  ELSE
    farm_name := NULLIF(trim(COALESCE(meta ->> 'farm_name', meta ->> 'farmName', '')), '');
    IF farm_name IS NULL THEN
      farm_name := 'Mi granja';
    END IF;

    INSERT INTO public.organizations (
      name,
      invite_code,
      invite_default_role,
      signup_owner_email,
      signup_owner_user_id
    )
    VALUES (
      farm_name,
      upper('CAP-' || to_char(now(), 'YYYY') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12)),
      'operator',
      NEW.email,
      NEW.id
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (user_id, organization_id)
    VALUES (NEW.id, new_org_id);

    new_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, role, email, full_name)
  VALUES (NEW.id, new_role, NEW.email, display_name)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

ALTER FUNCTION public.handle_new_user_after_insert() OWNER TO postgres;

-- Misma convención de email en el refuerzo RPC (auth.users es la fuente de verdad).
CREATE OR REPLACE FUNCTION public.ensure_own_farm_organization(
  p_farm_name text DEFAULT NULL,
  p_invite_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  uid uuid := auth.uid();
  invite_norm text;
  target_org uuid;
  assign_role text;
  farm text;
  new_org_id uuid;
  new_role text;
  owner_email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT u.email INTO owner_email FROM auth.users u WHERE u.id = uid;

  IF EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = uid) THEN
    RETURN jsonb_build_object('ok', true, 'already_member', true);
  END IF;

  invite_norm := upper(trim(COALESCE(p_invite_code, '')));

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
    VALUES (uid, target_org);

    new_role := CASE COALESCE(assign_role, 'operator')
      WHEN 'admin' THEN 'admin'
      WHEN 'vendedor' THEN 'vendedor'
      ELSE 'operator'
    END;

    INSERT INTO public.profiles (id, role, email)
    VALUES (uid, new_role, owner_email)
    ON CONFLICT (id) DO UPDATE
      SET role = EXCLUDED.role,
          email = COALESCE(EXCLUDED.email, public.profiles.email);

    RETURN jsonb_build_object('ok', true, 'joined', true);
  END IF;

  farm := NULLIF(trim(COALESCE(p_farm_name, '')), '');
  IF farm IS NULL THEN
    farm := 'Mi granja';
  END IF;

  INSERT INTO public.organizations (
    name,
    invite_code,
    invite_default_role,
    signup_owner_email,
    signup_owner_user_id
  )
  VALUES (
    farm,
    upper('CAP-' || to_char(now(), 'YYYY') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12)),
    'operator',
    owner_email,
    uid
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (user_id, organization_id)
  VALUES (uid, new_org_id);

  INSERT INTO public.profiles (id, role, email)
  VALUES (uid, 'admin', owner_email)
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        email = COALESCE(EXCLUDED.email, public.profiles.email);

  RETURN jsonb_build_object('ok', true, 'created', true, 'organization_id', new_org_id);
END;
$$;

ALTER FUNCTION public.ensure_own_farm_organization(text, text) OWNER TO postgres;
