-- Function execute privileges default broadly unless explicitly revoked.
-- GC discovery is a homeowner project workflow, so only authenticated users
-- should be able to call it. The function body still checks project ownership.

REVOKE ALL ON FUNCTION public.general_contractors_for_project(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.general_contractors_for_project(UUID) TO authenticated;
