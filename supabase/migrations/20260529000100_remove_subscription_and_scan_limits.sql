-- Remove monetization-related schema now that Tablink no longer gates scans.

drop table if exists public.scan_events;

alter table public.user_profiles
  drop column if exists subscription_tier;
