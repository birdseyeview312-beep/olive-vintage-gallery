create table if not exists public.inquiry_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  submitted_at timestamptz not null default now()
);

create index if not exists inquiry_rate_limits_ip_time_idx
  on public.inquiry_rate_limits (ip_hash, submitted_at desc);

alter table public.inquiry_rate_limits enable row level security;
revoke all on public.inquiry_rate_limits from anon, authenticated;
grant all on public.inquiry_rate_limits to service_role;
