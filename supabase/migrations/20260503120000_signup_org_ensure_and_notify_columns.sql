-- 1) Datos para notificación al crear granja (owner al momento del alta).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS signup_owner_email text,
  ADD COLUMN IF NOT EXISTS signup_owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.signup_owner_email IS
  'Correo del usuario que creó la organización (alta sin invitación); para avisos internos.';
COMMENT ON COLUMN public.organizations.signup_owner_user_id IS
  'Usuario que creó la organización en el flujo de nueva granja.';

-- 2) Alta de usuario: metadatos de granja/invitación + org nueva con email del owner.
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

-- 3) Reparación / refuerzo: si el usuario está autenticado y no tiene membresía, crea org o une por invitación.
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
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

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

    new_role := CASE assign_role
      WHEN 'admin' THEN 'admin'
      WHEN 'vendedor' THEN 'vendedor'
      ELSE 'operator'
    END;

    INSERT INTO public.profiles (id, role)
    VALUES (uid, new_role)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

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
    (SELECT email FROM auth.users WHERE id = uid),
    uid
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (user_id, organization_id)
  VALUES (uid, new_org_id);

  INSERT INTO public.profiles (id, role)
  VALUES (uid, 'admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin';

  RETURN jsonb_build_object('ok', true, 'created', true, 'organization_id', new_org_id);
END;
$$;

ALTER FUNCTION public.ensure_own_farm_organization(text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ensure_own_farm_organization(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_own_farm_organization(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Webhook → Edge Function notify-new-org (ejecutar en SQL Editor si preferís SQL al asistente del Dashboard):
--
-- 1) Deploy: supabase functions deploy notify-new-org
-- 2) Secrets (Dashboard → Edge Functions → Secrets): RESEND_API_KEY, RESEND_FROM_EMAIL, NOTIFY_ORG_WEBHOOK_SECRET (opcional)
-- 3) Reemplazá PROJECT_REF, SERVICE_ROLE_KEY y el valor de x-notify-secret si lo usás.
--
-- DROP TRIGGER IF EXISTS "notify-new-org" ON public.organizations;
-- CREATE TRIGGER "notify-new-org"
--   AFTER INSERT ON public.organizations
--   FOR EACH ROW
--   EXECUTE PROCEDURE supabase_functions.http_request(
--     'https://PROJECT_REF.supabase.co/functions/v1/notify-new-org',
--     'POST',
--     '{"Content-Type":"application/json","Authorization":"Bearer SERVICE_ROLE_KEY","x-notify-secret":"EL_MISMO_QUE_NOTIFY_ORG_WEBHOOK_SECRET"}',
--     '{}',
--     '10000'
--   );
--
-- Alternativa sin SQL: Dashboard → Integrations → Database Webhooks → New hook
--   Table: organizations | Events: INSERT | HTTP Request: POST a la misma URL
--   Headers: Content-Type, Authorization (Bearer service_role), x-notify-secret (opcional)
-- ---------------------------------------------------------------------------
