CREATE OR REPLACE FUNCTION public.debug_find_user(p_email TEXT)
RETURNS TABLE(id UUID, email TEXT, role TEXT, confirmed_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email::text, p.role::text, u.email_confirmed_at
  FROM auth.users u
  LEFT JOIN public.users p ON p.id = u.id
  WHERE u.email ILIKE '%' || p_email || '%';
$$;

GRANT EXECUTE ON FUNCTION public.debug_find_user(TEXT) TO anon, authenticated, service_role;
