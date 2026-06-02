-- Add 'diy_saved' as a valid project status for DIY guide projects
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft', 'dispatching', 'scheduling', 'accepted', 'quoting',
    'active', 'completed', 'cancelled', 'disputed', 'diy_saved'
  ));
