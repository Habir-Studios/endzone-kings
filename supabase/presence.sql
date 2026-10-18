-- Endzone Kings: online / offline on player profiles. Run once in the Supabase SQL editor.
-- The game pings every minute while it's open; a profile shows Online if the last ping was under 2.5 minutes ago.
alter table public.ek_players add column if not exists last_seen timestamptz;
create or replace function public.ek_ping() returns void language sql security definer set search_path = public as $$
  update public.ek_players set last_seen = now() where id = auth.uid();
$$;
revoke all on function public.ek_ping() from public;
grant execute on function public.ek_ping() to authenticated;
