-- Asegurar ON DELETE CASCADE en todas las FK públicas que referencian gallineros(id).
-- Así al borrar un gallinero no falla por claves foráneas (production_records, events, etc.).
-- Nota: public.sales no tiene gallinero_id; las ventas son por organización.

DO $$
DECLARE
  fk RECORD;
  attnames text;
BEGIN
  FOR fk IN
    SELECT
      c.conname AS constraint_name,
      n.nspname AS schema_name,
      cl.relname AS table_name,
      c.conkey AS conkey,
      c.conrelid AS conrelid
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE c.contype = 'f'
      AND ref.relname = 'gallineros'
      AND refn.nspname = 'public'
      AND n.nspname = 'public'
      AND cl.relname <> 'gallineros'
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
    INTO attnames
    FROM unnest(fk.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = u.attnum AND NOT a.attisdropped;

    IF attnames IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
      fk.schema_name,
      fk.table_name,
      fk.constraint_name
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.gallineros(id) ON DELETE CASCADE',
      fk.schema_name,
      fk.table_name,
      fk.constraint_name,
      attnames
    );
  END LOOP;
END $$;
