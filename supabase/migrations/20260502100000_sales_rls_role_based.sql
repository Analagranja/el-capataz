-- RLS en sales: además de pertenecer a la organización, el rol debe ser admin o vendedor.
-- Reemplaza: sales_select_org, sales_insert_org, sales_update_org, sales_delete_org
--
-- Revertir (manual, si hace falta): ver comentario al final del archivo.

-- 1) Prerrequisito: leer el rol del perfil sin recursión RLS (SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

COMMENT ON FUNCTION public.current_profile_role() IS
  'Rol en profiles del usuario autenticado; usado en políticas RLS multi-rol.';

-- 2) sales: habilitar RLS (idempotente) y sustituir políticas

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_select_org" ON public.sales;
DROP POLICY IF EXISTS "sales_insert_org" ON public.sales;
DROP POLICY IF EXISTS "sales_update_org" ON public.sales;
DROP POLICY IF EXISTS "sales_delete_org" ON public.sales;

-- Evitar nombres duplicados si se re-ejecuta el script
DROP POLICY IF EXISTS "sales_select_role" ON public.sales;
DROP POLICY IF EXISTS "sales_insert_role" ON public.sales;
DROP POLICY IF EXISTS "sales_update_role" ON public.sales;
DROP POLICY IF EXISTS "sales_delete_role" ON public.sales;

CREATE POLICY "sales_select_role"
  ON public.sales FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
    AND public.current_profile_role() = ANY (ARRAY['admin'::text, 'vendedor'::text])
  );

CREATE POLICY "sales_insert_role"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
    AND public.current_profile_role() = ANY (ARRAY['admin'::text, 'vendedor'::text])
  );

CREATE POLICY "sales_update_role"
  ON public.sales FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
    AND public.current_profile_role() = ANY (ARRAY['admin'::text, 'vendedor'::text])
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
    AND public.current_profile_role() = ANY (ARRAY['admin'::text, 'vendedor'::text])
  );

CREATE POLICY "sales_delete_role"
  ON public.sales FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
    AND public.current_profile_role() = ANY (ARRAY['admin'::text, 'vendedor'::text])
  );

/*
-- ---------- REVERTIR sales + función (ejecutar solo si necesitás volver atrás) ----------
DROP POLICY IF EXISTS "sales_select_role" ON public.sales;
DROP POLICY IF EXISTS "sales_insert_role" ON public.sales;
DROP POLICY IF EXISTS "sales_update_role" ON public.sales;
DROP POLICY IF EXISTS "sales_delete_role" ON public.sales;

CREATE POLICY "sales_select_org"
  ON public.sales FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sales_insert_org"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sales_update_org"
  ON public.sales FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "sales_delete_org"
  ON public.sales FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

-- Quitar la función solo si ninguna otra tabla/política la usa aún:
-- DROP FUNCTION IF EXISTS public.current_profile_role();
*/
