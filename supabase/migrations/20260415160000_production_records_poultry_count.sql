-- Población de gallinas al momento del registro (postura histórica no afectada por bajas posteriores).

ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS poultry_count integer;

UPDATE public.production_records pr
SET poultry_count = g.current_count
FROM public.gallineros g
WHERE pr.gallinero_id = g.id
  AND pr.organization_id = g.organization_id
  AND pr.poultry_count IS NULL;

UPDATE public.production_records
SET poultry_count = GREATEST(eggs_count, 1)
WHERE poultry_count IS NULL AND eggs_count > 0;

UPDATE public.production_records
SET poultry_count = 0
WHERE poultry_count IS NULL;

ALTER TABLE public.production_records
  ALTER COLUMN poultry_count SET NOT NULL;

UPDATE public.production_records
SET laying_percentage = CASE
  WHEN poultry_count > 0 THEN (eggs_count::numeric / poultry_count::numeric) * 100
  ELSE 0
END;
