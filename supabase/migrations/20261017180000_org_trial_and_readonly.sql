-- Prueba de 15 días (orgs nuevas) + reloj de 3 días al dejar de pagar.
-- Aditivo: orgs existentes quedan con trial_ends_at y paying_status_changed_at en NULL.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS paying_status_changed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NULL;

COMMENT ON COLUMN public.organizations.paying_status_changed_at IS
  'Último cambio de is_paying_customer vía platform_admin_set_paying_customer, o inicio explícito de plazo. NULL = Ana no inició cobro; no corre el plazo de 3 días.';
COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'Fin de prueba de 15 días. Solo orgs nuevas (DEFAULT / trigger de INSERT). Existentes quedan NULL.';

-- DEFAULT solo para INSERT futuros. No va en el ADD COLUMN: now() es volátil y backfillearía filas actuales.
ALTER TABLE public.organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '15 days');

CREATE OR REPLACE FUNCTION public.organizations_set_trial_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := now() + interval '15 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_set_trial_on_insert ON public.organizations;
CREATE TRIGGER trg_organizations_set_trial_on_insert
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.organizations_set_trial_on_insert();

-- Solo lectura: si hay paying_status_changed_at, ese reloj pisa al trial
-- (si no, un trial vencido hace >3 días dejaría read-only aunque Ana acabe de iniciar el plazo).
-- Si no hay toggle, corre trial_ends_at + 3 días. Ambos NULL = nunca read-only.
CREATE OR REPLACE FUNCTION public.organization_read_only_at(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT
        o.is_paying_customer = false
        AND CASE
          WHEN o.paying_status_changed_at IS NOT NULL THEN
            now() >= o.paying_status_changed_at + interval '3 days'
          WHEN o.trial_ends_at IS NOT NULL THEN
            now() >= o.trial_ends_at + interval '3 days'
          ELSE false
        END
      FROM public.organizations o
      WHERE o.id = p_org_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.organization_read_only_at(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organization_read_only_at(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_organizations_paying_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    IF NEW.is_paying_customer IS DISTINCT FROM OLD.is_paying_customer THEN
      NEW.is_paying_customer := OLD.is_paying_customer;
    END IF;
    IF NEW.paying_status_changed_at IS DISTINCT FROM OLD.paying_status_changed_at THEN
      NEW.paying_status_changed_at := OLD.paying_status_changed_at;
    END IF;
    IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
      NEW.trial_ends_at := OLD.trial_ends_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  SET
    is_paying_customer = coalesce(p_paying, false),
    paying_status_changed_at = CASE
      WHEN is_paying_customer IS DISTINCT FROM coalesce(p_paying, false)
        THEN now()
      ELSE paying_status_changed_at
    END
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_set_paying_customer(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_set_paying_customer(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_admin_start_unpaid_grace(p_org_id uuid)
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
  SET
    is_paying_customer = false,
    paying_status_changed_at = now()
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_start_unpaid_grace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_start_unpaid_grace(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.platform_admin_list_organizations();

CREATE FUNCTION public.platform_admin_list_organizations()
RETURNS TABLE (
  id uuid,
  name text,
  is_paying_customer boolean,
  created_at timestamptz,
  signup_owner_email text,
  paying_status_changed_at timestamptz,
  trial_ends_at timestamptz,
  read_only boolean
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
  SELECT
    o.id,
    o.name,
    o.is_paying_customer,
    o.created_at,
    o.signup_owner_email,
    o.paying_status_changed_at,
    o.trial_ends_at,
    public.organization_read_only_at(o.id) AS read_only
  FROM public.organizations o
  ORDER BY o.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_list_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_list_organizations() TO authenticated;
