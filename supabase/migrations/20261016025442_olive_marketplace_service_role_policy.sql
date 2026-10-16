drop policy if exists marketplace_config_service_role_access on public.marketplace_config;
create policy marketplace_config_service_role_access on public.marketplace_config
  for all to service_role using (true) with check (true);
