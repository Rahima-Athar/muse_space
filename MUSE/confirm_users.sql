-- ============================================================
-- MUSE — Confirm All Users in Supabase
-- ============================================================
-- Note: "confirmed_at" is a generated column in Supabase,
-- so we only update "email_confirmed_at".

UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;
