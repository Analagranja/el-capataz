-- Camadas (lotes) separadas del gallinero (espacio físico)

CREATE TABLE IF NOT EXISTS public.gallinero_flocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  gallinero_id uuid NOT NULL REFERENCES public.gallineros (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Camada 1',
  current_count integer NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  birth_date date NULL,
  breed text NULL,
  feather_color text NULL,
  average_weight_kg numeric NULL,
  band_number text NULL,
  band_color text NULL,
  supplier text NULL,
  notes_flock text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallinero_flocks_org_gallinero
  ON public.gallinero_flocks (organization_id, gallinero_id);

CREATE INDEX IF NOT EXISTS idx_gallinero_flocks_active
  ON public.gallinero_flocks (gallinero_id, status)
  WHERE status = 'active';

ALTER TABLE public.gallinero_flocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flocks_org" ON public.gallinero_flocks;
CREATE POLICY "flocks_org"
  ON public.gallinero_flocks
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Migrar datos de lote que estaban en gallineros
INSERT INTO public.gallinero_flocks (
  organization_id,
  gallinero_id,
  name,
  current_count,
  birth_date,
  breed,
  feather_color,
  average_weight_kg,
  band_number,
  band_color,
  supplier,
  notes_flock
)
SELECT
  organization_id,
  id,
  'Camada 1',
  current_count,
  birth_date,
  breed,
  feather_color,
  average_weight_kg,
  band_number,
  band_color,
  supplier,
  notes_flock
FROM public.gallineros
WHERE current_count > 0;

ALTER TABLE public.gallineros
  DROP COLUMN IF EXISTS birth_date,
  DROP COLUMN IF EXISTS breed,
  DROP COLUMN IF EXISTS feather_color,
  DROP COLUMN IF EXISTS average_weight_kg,
  DROP COLUMN IF EXISTS band_number,
  DROP COLUMN IF EXISTS band_color,
  DROP COLUMN IF EXISTS supplier,
  DROP COLUMN IF EXISTS notes_flock;

ALTER TABLE public.gallinero_mortality_logs
  ADD COLUMN IF NOT EXISTS flock_id uuid NULL REFERENCES public.gallinero_flocks (id) ON DELETE SET NULL;

UPDATE public.gallinero_mortality_logs m
SET flock_id = f.id
FROM public.gallinero_flocks f
WHERE m.flock_id IS NULL
  AND f.gallinero_id = m.gallinero_id
  AND f.name = 'Camada 1';

UPDATE public.gallineros g
SET
  current_count = COALESCE(
    (
      SELECT SUM(f.current_count)::integer
      FROM public.gallinero_flocks f
      WHERE f.gallinero_id = g.id
        AND f.status = 'active'
    ),
    0
  ),
  updated_at = now();
