
-- Keep the owner-facing eBay status complete and schedule the protected importer.
create or replace function public.admin_get_ebay_status()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $function$
declare
  cfg public.marketplace_config%rowtype;
  client_hint text;
  refresh_ready boolean := false;
begin
  select * into cfg from public.marketplace_config where id = true;
  select right(decrypted_secret, 6) into client_hint
    from vault.decrypted_secrets where name = 'olive_ebay_client_id' limit 1;
  select exists(select 1 from vault.secrets where name = 'olive_ebay_refresh_token')
    into refresh_ready;
  return jsonb_build_object(
    'enabled', cfg.ebay_enabled,
    'mode', cfg.ebay_mode,
    'marketplace_id', cfg.ebay_marketplace_id,
    'category_id', cfg.ebay_category_id,
    'merchant_location_key', cfg.ebay_merchant_location_key,
    'payment_policy_id', cfg.ebay_payment_policy_id,
    'fulfillment_policy_id', cfg.ebay_fulfillment_policy_id,
    'return_policy_id', cfg.ebay_return_policy_id,
    'condition', cfg.ebay_condition,
    'credential_state', cfg.ebay_credential_state,
    'client_id_hint', client_hint,
    'refresh_token_configured', refresh_ready,
    'whatnot_state', cfg.whatnot_state,
    'ebay_import_last_run', cfg.ebay_import_last_run,
    'ebay_import_last_success', cfg.ebay_import_last_success,
    'ebay_import_last_error', cfg.ebay_import_last_error,
    'ebay_import_last_count', cfg.ebay_import_last_count
  );
end;
$function$;

do $block$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job
    where jobname = 'olive-ebay-marketplace-import' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$block$;

select cron.schedule(
  'olive-ebay-marketplace-import',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://hasewamqjectpfxxwspo.supabase.co/functions/v1/marketplace-import-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-olive-worker-key', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'olive_marketplace_worker_key' limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $cron$
);
