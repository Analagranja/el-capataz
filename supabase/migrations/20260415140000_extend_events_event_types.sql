-- Extend events.event_type for Premium Eventos: new categories + migrate legacy values.

UPDATE public.events SET event_type = 'vacunacion' WHERE event_type = 'vacuna';
UPDATE public.events SET event_type = 'otros' WHERE event_type = 'observacion';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_type_check
  CHECK (
    event_type IN (
      'vacunacion',
      'ingreso_pollitas',
      'vitaminas',
      'medicacion',
      'muerte',
      'otros'
    )
  );
