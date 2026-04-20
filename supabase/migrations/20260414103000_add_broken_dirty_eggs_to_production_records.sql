ALTER TABLE public.production_records
ADD COLUMN IF NOT EXISTS broken_dirty_eggs_count integer NOT NULL DEFAULT 0;
