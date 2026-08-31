create or replace function public.server_get_payment_status()
returns jsonb
language sql
security definer
set search_path='public'
as $$
  select jsonb_build_object(
    'provider', 'square',
    'enabled', enabled and credential_state='configured' and provider='square',
    'mode', square_mode
  )
  from public.payment_config
  where id=true;
$$;

revoke all on function public.server_get_payment_status() from public, anon, authenticated;
grant execute on function public.server_get_payment_status() to service_role;
