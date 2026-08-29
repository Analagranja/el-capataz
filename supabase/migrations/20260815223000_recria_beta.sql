-- Recría (Beta): módulo aditivo, separado de producción y gallineros activos.

CREATE TABLE IF NOT EXISTS public.recria_flocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'graduated', 'retired')),
  initial_count integer NOT NULL CHECK (initial_count > 0),
  current_count integer NOT NULL CHECK (current_count >= 0),
  breed text NULL,
  supplier text NULL,
  birth_date date NULL,
  entry_date date NOT NULL,
  location_notes text NULL,
  notes text NULL,
  graduated_at timestamptz NULL,
  graduated_gallinero_id uuid NULL REFERENCES public.gallineros (id) ON DELETE SET NULL,
  graduated_flock_id uuid NULL REFERENCES public.gallinero_flocks (id) ON DELETE SET NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recria_flocks_org_status
  ON public.recria_flocks (organization_id, status, entry_date DESC);

CREATE TABLE IF NOT EXISTS public.recria_weekly_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  recria_flock_id uuid NOT NULL REFERENCES public.recria_flocks (id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  average_weight_g integer NULL CHECK (average_weight_g IS NULL OR average_weight_g >= 0),
  mortality_count integer NOT NULL DEFAULT 0 CHECK (mortality_count >= 0),
  mortality_reason text NULL,
  feed_stage text NOT NULL
    CHECK (feed_stage IN ('pre_iniciador', 'iniciador', 'crecimiento', 'desarrollo', 'pre_postura')),
  notes text NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recria_flock_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_recria_followups_org_flock_date
  ON public.recria_weekly_followups (organization_id, recria_flock_id, week_start_date DESC);

CREATE TABLE IF NOT EXISTS public.recria_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  recria_flock_id uuid NOT NULL REFERENCES public.recria_flocks (id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('vacunacion', 'vitaminas', 'medicacion', 'otros')),
  description text NOT NULL,
  affected_count integer NOT NULL DEFAULT 0 CHECK (affected_count >= 0),
  event_date date NOT NULL DEFAULT current_date,
  reminder_date date NULL,
  completed boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recria_events_org_flock_date
  ON public.recria_events (organization_id, recria_flock_id, event_date DESC);

ALTER TABLE public.recria_flocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recria_weekly_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recria_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recria_flocks_org"
  ON public.recria_flocks FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "recria_weekly_followups_org"
  ON public.recria_weekly_followups FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "recria_events_org"
  ON public.recria_events FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Guarda seguimiento y descuenta bajas en una única transacción.
CREATE OR REPLACE FUNCTION public.record_recria_weekly_followup(
  p_organization_id uuid,
  p_recria_flock_id uuid,
  p_week_start_date date,
  p_average_weight_g integer,
  p_mortality_count integer,
  p_mortality_reason text,
  p_feed_stage text,
  p_notes text
)
RETURNS public.recria_weekly_followups
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_flock public.recria_flocks%ROWTYPE;
  v_followup public.recria_weekly_followups%ROWTYPE;
  v_mortality integer := GREATEST(0, COALESCE(p_mortality_count, 0));
BEGIN
  SELECT *
    INTO v_flock
    FROM public.recria_flocks
   WHERE id = p_recria_flock_id
     AND organization_id = p_organization_id
     AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Camada de recría activa no encontrada';
  END IF;

  IF v_mortality > v_flock.current_count THEN
    RAISE EXCEPTION 'Las bajas no pueden superar las aves vivas (%)', v_flock.current_count;
  END IF;

  INSERT INTO public.recria_weekly_followups (
    organization_id, recria_flock_id, week_start_date, average_weight_g,
    mortality_count, mortality_reason, feed_stage, notes, created_by
  )
  VALUES (
    p_organization_id, p_recria_flock_id, p_week_start_date, p_average_weight_g,
    v_mortality, NULLIF(trim(p_mortality_reason), ''), p_feed_stage,
    NULLIF(trim(p_notes), ''), auth.uid()
  )
  RETURNING * INTO v_followup;

  UPDATE public.recria_flocks
     SET current_count = current_count - v_mortality,
         updated_at = now()
   WHERE id = p_recria_flock_id;

  RETURN v_followup;
END;
$$;

-- Gradúa una camada sin exponerla a Producción hasta crear el flock activo.
CREATE OR REPLACE FUNCTION public.graduate_recria_flock(
  p_organization_id uuid,
  p_recria_flock_id uuid,
  p_gallinero_id uuid,
  p_flock_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recria public.recria_flocks%ROWTYPE;
  v_new_flock_id uuid;
  v_total integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.organization_members
     WHERE organization_id = p_organization_id
       AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
    INTO v_recria
    FROM public.recria_flocks
   WHERE id = p_recria_flock_id
     AND organization_id = p_organization_id
     AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND OR v_recria.current_count <= 0 THEN
    RAISE EXCEPTION 'La camada no está disponible para graduar';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.gallineros
     WHERE id = p_gallinero_id
       AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Gallinero de destino inválido';
  END IF;

  INSERT INTO public.gallinero_flocks (
    organization_id, gallinero_id, name, current_count, status,
    birth_date, breed, supplier, notes_flock
  )
  VALUES (
    p_organization_id,
    p_gallinero_id,
    COALESCE(NULLIF(trim(p_flock_name), ''), v_recria.name),
    v_recria.current_count,
    'active',
    COALESCE(v_recria.birth_date, v_recria.entry_date),
    v_recria.breed,
    v_recria.supplier,
    CASE
      WHEN v_recria.birth_date IS NULL
        THEN concat_ws(E'\n', v_recria.notes, 'Fecha de nacimiento aproximada: se usó la fecha de ingreso a la granja.')
      ELSE v_recria.notes
    END
  )
  RETURNING id INTO v_new_flock_id;

  SELECT COALESCE(SUM(current_count), 0)::integer
    INTO v_total
    FROM public.gallinero_flocks
   WHERE organization_id = p_organization_id
     AND gallinero_id = p_gallinero_id
     AND status = 'active';

  UPDATE public.gallineros
     SET current_count = v_total,
         updated_at = now()
   WHERE id = p_gallinero_id
     AND organization_id = p_organization_id;

  UPDATE public.recria_flocks
     SET status = 'graduated',
         graduated_at = now(),
         graduated_gallinero_id = p_gallinero_id,
         graduated_flock_id = v_new_flock_id,
         updated_at = now()
   WHERE id = v_recria.id;

  RETURN v_new_flock_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_recria_weekly_followup(uuid, uuid, date, integer, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_recria_weekly_followup(uuid, uuid, date, integer, integer, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.graduate_recria_flock(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.graduate_recria_flock(uuid, uuid, uuid, text) TO authenticated;
