create schema if not exists olive_private;
revoke all on schema olive_private from public,anon,authenticated;
grant usage on schema olive_private to service_role;

create or replace function olive_private.upsert_vault_secret(p_name text,p_value text)
returns void language plpgsql security definer
set search_path=public,vault,olive_private,pg_temp as $fn$
declare secret_id uuid;
begin
  if p_value is null or btrim(p_value)='' then return; end if;
  select id into secret_id from vault.secrets where name=p_name order by created_at limit 1;
  if secret_id is null then perform vault.create_secret(p_value,p_name);
  else perform vault.update_secret(secret_id,p_value,p_name,'Olive Vintage eBay integration credential'); end if;
end;$fn$;
revoke all on function olive_private.upsert_vault_secret(text,text) from public,anon,authenticated;
grant execute on function olive_private.upsert_vault_secret(text,text) to service_role;

create or replace function public.server_get_ebay_credentials()
returns jsonb language sql security definer set search_path=public,vault,pg_temp as $fn$
select jsonb_build_object(
 'client_id',(select decrypted_secret from vault.decrypted_secrets where name='olive_ebay_client_id' order by created_at limit 1),
 'client_secret',(select decrypted_secret from vault.decrypted_secrets where name='olive_ebay_client_secret' order by created_at limit 1),
 'refresh_token',(select decrypted_secret from vault.decrypted_secrets where name='olive_ebay_refresh_token' order by created_at limit 1),
 'mode',c.ebay_mode,'marketplace_id',c.ebay_marketplace_id)
from public.marketplace_config c where c.id=true;$fn$;

create or replace function public.admin_get_ebay_status()
returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $fn$
declare c public.marketplace_config%rowtype;
begin
 select * into c from public.marketplace_config where id=true;
 return jsonb_build_object('enabled',c.ebay_enabled,'mode',c.ebay_mode,
  'marketplace_id',c.ebay_marketplace_id,'category_id',c.ebay_category_id,
  'merchant_location_key',c.ebay_merchant_location_key,'payment_policy_id',c.ebay_payment_policy_id,
  'fulfillment_policy_id',c.ebay_fulfillment_policy_id,'return_policy_id',c.ebay_return_policy_id,
  'condition',c.ebay_condition,'credential_state',c.ebay_credential_state,
  'client_id_hint',(select right(decrypted_secret,6) from vault.decrypted_secrets
    where name='olive_ebay_client_id' order by created_at limit 1),
  'refresh_token_configured',exists(select 1 from vault.secrets where name='olive_ebay_refresh_token'),
  'whatnot_state',c.whatnot_state,'ebay_import_last_run',c.ebay_import_last_run,
  'ebay_import_last_success',c.ebay_import_last_success,'ebay_import_last_error',c.ebay_import_last_error,
  'ebay_import_last_count',c.ebay_import_last_count);
end;$fn$;

create or replace function public.admin_set_ebay_settings(
 p_client_id text,p_client_secret text,p_refresh_token text,p_mode text,p_marketplace_id text,
 p_category_id text,p_merchant_location_key text,p_payment_policy_id text,
 p_fulfillment_policy_id text,p_return_policy_id text,p_condition text,p_enabled boolean)
returns jsonb language plpgsql security definer
set search_path=public,vault,olive_private,pg_temp as $fn$
begin
 if p_mode not in ('live','sandbox') then raise exception 'Invalid eBay mode'; end if;
 perform olive_private.upsert_vault_secret('olive_ebay_client_id',p_client_id);
 perform olive_private.upsert_vault_secret('olive_ebay_client_secret',p_client_secret);
 perform olive_private.upsert_vault_secret('olive_ebay_refresh_token',p_refresh_token);
 update public.marketplace_config set ebay_enabled=coalesce(p_enabled,true),
  ebay_import_enabled=coalesce(p_enabled,true),ebay_mode=p_mode,
  ebay_marketplace_id=coalesce(nullif(p_marketplace_id,''),'EBAY_US'),
  ebay_category_id=p_category_id,ebay_merchant_location_key=p_merchant_location_key,
  ebay_payment_policy_id=p_payment_policy_id,ebay_fulfillment_policy_id=p_fulfillment_policy_id,
  ebay_return_policy_id=p_return_policy_id,ebay_condition=coalesce(nullif(p_condition,''),'USED_EXCELLENT'),
  ebay_credential_state='connected',updated_at=now() where id=true;
 return public.admin_get_ebay_status();
end;$fn$;

create or replace function public.admin_clear_ebay_settings()
returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $fn$
declare s record;
begin
 for s in select id from vault.secrets where name in
  ('olive_ebay_client_id','olive_ebay_client_secret','olive_ebay_refresh_token')
 loop perform vault.delete_secret(s.id); end loop;
 update public.marketplace_config set ebay_enabled=false,ebay_credential_state='not_configured',
  updated_at=now() where id=true;
 return public.admin_get_ebay_status();
end;$fn$;

revoke all on function public.server_get_ebay_credentials() from public,anon,authenticated;
revoke all on function public.admin_get_ebay_status() from public,anon,authenticated;
revoke all on function public.admin_set_ebay_settings(text,text,text,text,text,text,text,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.admin_clear_ebay_settings() from public,anon,authenticated;
grant execute on function public.server_get_ebay_credentials() to service_role;
grant execute on function public.admin_get_ebay_status() to service_role;
grant execute on function public.admin_set_ebay_settings(text,text,text,text,text,text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.admin_clear_ebay_settings() to service_role;
