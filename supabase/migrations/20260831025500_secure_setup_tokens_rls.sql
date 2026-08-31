-- Setup tokens are server-only secrets. Keep the table unavailable to browser
-- clients while allowing trusted service-role operations to bypass RLS.
alter table public.secure_setup_tokens enable row level security;
revoke all privileges on table public.secure_setup_tokens from anon, authenticated;

-- Remove any setup links that have already expired.
delete from public.secure_setup_tokens where expires_at < now();
