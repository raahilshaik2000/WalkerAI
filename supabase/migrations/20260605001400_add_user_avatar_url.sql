-- Profile avatars are uploaded to the public avatars bucket; persist the public
-- URL on the user row so profiles survive sign-out/reinstall and device changes.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
