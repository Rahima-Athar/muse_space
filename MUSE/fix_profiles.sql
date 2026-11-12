-- ============================================================
-- MUSE — Fix profiles table
-- Supabase Dashboard -> SQL Editor -> paste -> Run
-- Safe to run multiple times.
-- ============================================================

-- 1) Add the missing email column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2) Ensure RLS policies exist on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 3) Recreate the signup trigger (saves the chosen username)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  suffix INT := 0;
BEGIN
  base_username := LOWER(
    COALESCE(
      NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g'), ''),
      ''
    )
  );
  base_username := LEFT(base_username, 20);
  IF LENGTH(base_username) < 3 THEN
    base_username := 'creator';
  END IF;

  -- Prefer the username chosen at signup. Only append a numeric suffix if
  -- someone else already owns it, so the chosen handle is actually saved.
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := LEFT(base_username, 30 - LENGTH(suffix::TEXT)) || suffix::TEXT;
  END LOOP;

  INSERT INTO public.profiles (id, email, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Creative Creator'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(excluded.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4) Backfill a profile for every existing account that has none
INSERT INTO public.profiles (id, email, username, full_name)
SELECT
  u.id,
  u.email,
  LEFT(
    LOWER(
      COALESCE(
        NULLIF(regexp_replace(COALESCE(u.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g'), ''),
        'creator'
      )
    ),
    20
  ) || '_' || SUBSTRING(u.id::TEXT, 1, 6),
  COALESCE(u.raw_user_meta_data->>'full_name', 'Creative Creator')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT DO NOTHING;
