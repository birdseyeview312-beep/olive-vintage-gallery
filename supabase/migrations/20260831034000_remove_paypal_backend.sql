drop function if exists public.admin_clear_paypal_settings();
drop function if exists public.admin_get_paypal_status();
drop function if exists public.admin_set_paypal_settings(text,text,text);
drop function if exists public.server_attach_paypal_order(uuid,text);
drop function if exists public.server_get_paypal_credentials();

alter table public.payment_config
  drop column if exists paypal_mode,
  drop column if exists paypal_client_id,
  drop column if exists paypal_merchant_id;

update public.payment_config set provider='square' where id=true;
