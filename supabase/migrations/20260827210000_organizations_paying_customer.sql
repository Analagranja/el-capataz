-- Suscripción: flag informativo por organización + panel admin de plataforma.
-- No altera AuthContext, signup ni políticas de sesión existentes.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_paying_customer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_paying_customer IS
  'Granja con suscripción activa. false = periodo de prueba / pendiente de pago.';

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) IN (
    'adallasta@abc.gob.ar'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_organizations_paying_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_paying_customer IS DISTINCT FROM OLD.is_paying_customer
     AND NOT public.is_platform_admin() THEN
    NEW.is_paying_customer := OLD.is_paying_customer;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_organizations_paying_customer ON public.organizations;
CREATE TRIGGER trg_guard_organizations_paying_customer
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_organizations_paying_customer();

CREATE OR REPLACE FUNCTION public.platform_admin_list_organizations()
RETURNS TABLE (
  id uuid,
  name text,
  is_paying_customer boolean,
  created_at timestamptz,
  signup_owner_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.is_paying_customer, o.created_at, o.signup_owner_email
  FROM public.organizations o
  ORDER BY o.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_list_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_list_organizations() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_admin_set_paying_customer(
  p_org_id uuid,
  p_paying boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;
  UPDATE public.organizations
  SET is_paying_customer = coalesce(p_paying, false)
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_set_paying_customer(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_set_paying_customer(uuid, boolean) TO authenticated;

-- Marcado inicial (granja pagadora, admin y bonificada)
UPDATE public.organizations
SET is_paying_customer = true
WHERE id IN (
  '101ab884-20bb-4340-a100-c47681f01b44'::uuid,
  'c555edce-b8a3-4f4a-8db2-c79b4f85e133'::uuid,
  'fa171112-d50b-4d72-9a16-bae087ad4473'::uuid
);
