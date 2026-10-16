create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.products
  add column if not exists inventory_number text,
  add column if not exists category text,
  add column if not exists category_manual boolean not null default false,
  add column if not exists price numeric(12,2),
  add column if not exists date_period text,
  add column if not exists origin text,
  add column if not exists medium text,
  add column if not exists provenance text,
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists gallery_cover_image text,
  add column if not exists gallery_cover_source_image text,
  add column if not exists new_arrival boolean not null default false,
  add column if not exists inquire_only boolean not null default false,
  add column if not exists height numeric(8,2),
  add column if not exists width numeric(8,2),
  add column if not exists depth numeric(8,2),
  add column if not exists shipping_weight_oz numeric(8,2),
  add column if not exists shipping_length_in numeric(8,2),
  add column if not exists shipping_width_in numeric(8,2),
  add column if not exists shipping_height_in numeric(8,2),
  add column if not exists shipping_package_source text;

alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check(status=any(array['draft','available','active','sold','archived']));
alter table public.platform_listings add column if not exists sync_managed boolean not null default false;

update public.products p
set inventory_number=coalesce(nullif(p.sku,''),'OLIVE-'||left(p.id::text,8)),
    price=case when p.price_cents is not null then p.price_cents::numeric/100 else null end,
    date_period=p.era,
    images=coalesce((select jsonb_agg(pi.image_url order by pi.sort_order,pi.created_at)
      from public.product_images pi where pi.product_id=p.id),'[]'::jsonb),
    gallery_cover_image=(select pi.image_url from public.product_images pi where pi.product_id=p.id
      order by pi.is_primary desc,pi.sort_order,pi.created_at limit 1),
    gallery_cover_source_image=(select pi.image_url from public.product_images pi where pi.product_id=p.id
      order by pi.is_primary desc,pi.sort_order,pi.created_at limit 1);

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon,authenticated
using(status=any(array['available','active','sold']) or is_owner_or_admin());

create table if not exists public.marketplace_config (
  id boolean primary key default true check(id),
  ebay_enabled boolean not null default false,
  ebay_import_enabled boolean not null default true,
  ebay_mode text not null default 'live' check(ebay_mode in ('live','sandbox')),
  ebay_marketplace_id text not null default 'EBAY_US',
  ebay_category_id text, ebay_merchant_location_key text, ebay_payment_policy_id text,
  ebay_fulfillment_policy_id text, ebay_return_policy_id text,
  ebay_condition text not null default 'USED_EXCELLENT',
  ebay_credential_state text not null default 'not_configured',
  whatnot_state text not null default 'not_configured',
  worker_key_hash text,
  ebay_import_last_run timestamptz, ebay_import_last_success timestamptz,
  ebay_import_last_error text, ebay_import_last_count integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.marketplace_config(id) values(true) on conflict(id) do nothing;
alter table public.marketplace_config enable row level security;
revoke all on public.marketplace_config from anon,authenticated;
grant all on public.marketplace_config to service_role;
