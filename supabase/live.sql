-- Who's in a game right now (any mode), so profiles can show a Watch button. Players can only set their own.
alter table public.ek_players add column if not exists live jsonb;
grant update (live) on public.ek_players to authenticated;
