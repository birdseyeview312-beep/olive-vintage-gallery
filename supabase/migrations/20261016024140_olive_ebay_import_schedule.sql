do $block$
declare worker_key text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); secret_id uuid;
begin
 select id into secret_id from vault.secrets where name='olive_marketplace_worker_key' order by created_at limit 1;
 if secret_id is null then perform vault.create_secret(worker_key,'olive_marketplace_worker_key',
  'Olive Vintage scheduled eBay importer key');
 else select decrypted_secret into worker_key from vault.decrypted_secrets where id=secret_id; end if;
 update public.marketplace_config set worker_key_hash=encode(extensions.digest(worker_key,'sha256'),'hex'),
  updated_at=now() where id=true;
end;$block$;

do $block$
declare job bigint;
begin
 select jobid into job from cron.job where jobname='olive-ebay-marketplace-import' limit 1;
 if job is not null then perform cron.unschedule(job); end if;
end;$block$;

select cron.schedule('olive-ebay-marketplace-import','*/10 * * * *',$cron$
 select net.http_post(
  url:='https://jxjpvhszkkqorxpjzqot.supabase.co/functions/v1/marketplace-import-worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-olive-worker-key',
    (select decrypted_secret from vault.decrypted_secrets where name='olive_marketplace_worker_key'
      order by created_at limit 1)),
  body:='{}'::jsonb
 );
$cron$);
