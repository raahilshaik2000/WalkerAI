-- Self-service signup can choose one of the public app account types.
-- Admin roles must never be minted from user-controlled auth metadata.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT := NEW.raw_user_meta_data->>'role';
  safe_role TEXT;
BEGIN
  safe_role := CASE
    WHEN requested_role IN ('homeowner', 'company', 'supplier', 'general_contractor')
      THEN requested_role
    ELSE 'homeowner'
  END;

  INSERT INTO public.users (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    safe_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
