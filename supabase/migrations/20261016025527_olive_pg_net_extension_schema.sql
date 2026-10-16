-- pg_net is not relocatable. A clean install is required to place it under extensions.
-- This removes only pg_net-owned queue/response objects; confirm no pending requests before applying.
create schema if not exists extensions;
drop extension pg_net;
create extension pg_net with schema extensions;
