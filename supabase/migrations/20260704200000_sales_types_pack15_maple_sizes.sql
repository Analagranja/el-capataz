ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_type_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_sale_type_check
  CHECK (
    sale_type IN (
      'maple',
      'docena',
      'media_docena',
      'pack15',
      'maple_grande',
      'maple_mediano',
      'maple_chico'
    )
  );
