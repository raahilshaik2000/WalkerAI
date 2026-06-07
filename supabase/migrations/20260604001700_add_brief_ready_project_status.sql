-- A project can have a completed AI brief but no available contractor after
-- dispatch expansion. Keep it valid and visible instead of writing an invalid
-- status or leaving it stuck in expired dispatching.

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft',
    'brief_ready',
    'dispatching',
    'scheduling',
    'accepted',
    'quoting',
    'active',
    'completed',
    'cancelled',
    'disputed',
    'diy_saved'
  ));
