-- Safe RPC to register/reassign device token to the currently authenticated user
CREATE OR REPLACE FUNCTION register_device_token(p_token text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO device_tokens (user_id, token, platform, is_active, last_seen_at)
  VALUES (auth.uid(), p_token, p_platform, TRUE, NOW())
  ON CONFLICT (token) DO UPDATE SET
    user_id = auth.uid(),
    platform = EXCLUDED.platform,
    is_active = TRUE,
    last_seen_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION register_device_token(text, text) TO authenticated;
