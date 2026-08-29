-- Recría: peso semanal en gramos (para quien ya aplicó la beta con average_weight_kg).
-- Si Recría nunca se aplicó en Supabase, alcanza con 20260815223000_recria_beta.sql actualizado.

ALTER TABLE public.recria_weekly_followups
  ADD COLUMN IF NOT EXISTS average_weight_g integer NULL
    CHECK (average_weight_g IS NULL OR average_weight_g >= 0);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recria_weekly_followups'
      AND column_name = 'average_weight_kg'
  ) THEN
    UPDATE public.recria_weekly_followups
    SET average_weight_g = ROUND(average_weight_kg * 1000)::integer
    WHERE average_weight_kg IS NOT NULL
      AND average_weight_g IS NULL;

    ALTER TABLE public.recria_weekly_followups DROP COLUMN average_weight_kg;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.record_recria_weekly_followup(uuid, uuid, date, numeric, integer, text, text, text);

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

REVOKE ALL ON FUNCTION public.record_recria_weekly_followup(uuid, uuid, date, integer, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_recria_weekly_followup(uuid, uuid, date, integer, integer, text, text, text) TO authenticated;
