-- Endzone Kings: table permissions + Ultimate Team leaderboard. Run after social.sql and admin.sql. Safe to run again.
-- Newer Supabase projects don't hand tables to the website automatically, so without these every
-- profile, leaderboard, friend, message and clip request comes back "permission denied".
grant usage on schema public to anon, authenticated;
grant select on public.ek_players, public.ek_follows, public.ek_clips to anon, authenticated;
grant insert, delete on public.ek_follows to authenticated;
grant select, insert on public.ek_messages to authenticated;
grant update (read) on public.ek_messages to authenticated;
grant insert, delete on public.ek_clips to authenticated;
grant select on public.ek_bans to authenticated;
grant insert, select, update, delete on public.ek_reports to authenticated;
grant insert (id, name, bio, team, lvl, rp) on public.ek_players to authenticated;
grant update (name, bio, team, lvl, rp, updated_at) on public.ek_players to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Ultimate Team leaderboard columns
alter table public.ek_players add column if not exists ut_games int not null default 0;
alter table public.ek_players add column if not exists ut_wins int not null default 0;
alter table public.ek_players add column if not exists ut_tds int not null default 0;
alter table public.ek_players add column if not exists ut_pts int not null default 0;
-- separate records per mode
alter table public.ek_players add column if not exists on_w int not null default 0;
alter table public.ek_players add column if not exists on_l int not null default 0;
alter table public.ek_players add column if not exists on_t int not null default 0;
alter table public.ek_players add column if not exists ut_l int not null default 0;
alter table public.ek_players add column if not exists ut_t int not null default 0;
alter table public.ek_players add column if not exists fr_w int not null default 0;
alter table public.ek_players add column if not exists fr_l int not null default 0;
alter table public.ek_players add column if not exists fr_t int not null default 0;

create or replace function public.ek_add_game(s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  last timestamptz;
  bad text := '';
  fl int;
  py int := coalesce((s->>'py')::int, 0); ry int := coalesce((s->>'ry')::int, 0); recy int := coalesce((s->>'recy')::int, 0);
  tds int := coalesce((s->>'ptd')::int, 0) + coalesce((s->>'rtd')::int, 0) + coalesce((s->>'retd')::int, 0);
  secs int := coalesce((s->>'secs')::int, 0); qlen int := coalesce((s->>'qlen')::int, 120);
begin
  if uid is null then raise exception 'not signed in'; end if;
  if ek_banned(uid) then raise exception 'banned'; end if;
  insert into ek_players (id, name) values (uid, coalesce(nullif(left(s->>'name', 16), ''), 'Player')) on conflict (id) do nothing;
  select last_game into last from ek_players where id = uid;
  if last is not null and last > now() - interval '3 minutes' then raise exception 'too soon'; end if;
  if py > 900 or ry > 600 or recy > 900 or tds > 16 or coalesce((s->>'sk')::int, 0) > 15 or coalesce((s->>'int')::int, 0) > 10 then bad := 'impossible stat line'; end if;
  if secs > 0 and secs < qlen * 2 then bad := 'game finished faster than its clock'; end if;
  if recy > py + 60 then bad := 'more receiving yards than passing yards'; end if;
  if coalesce((s->>'ac')::int, 0) > 0 then bad := 'in-game integrity check failed: ' || left(coalesce(s->>'acWhy', ''), 120); end if;
  if bad <> '' then
    update ek_players set flags = flags + 1, last_game = now() where id = uid returning flags into fl;
    insert into ek_reports (reporter, target, reason, details) values (null, uid, 'auto: anti-cheat', bad || ': ' || left(s::text, 400));
    if fl >= 3 then insert into ek_bans (id, reason, by_admin) values (uid, 'Automatic anti-cheat ban (' || bad || ')', false) on conflict (id) do nothing; end if;
    return;
  end if;
  update ek_players set
    games = games + 1,
    wins = wins + case when s->>'res' = 'W' then 1 else 0 end,
    losses = losses + case when s->>'res' = 'L' then 1 else 0 end,
    pass_yds = pass_yds + greatest(py, -50),
    pass_td = pass_td + least(greatest(coalesce((s->>'ptd')::int, 0), 0), 12),
    rush_yds = rush_yds + greatest(ry, -50),
    rush_td = rush_td + least(greatest(coalesce((s->>'rtd')::int, 0), 0), 10),
    rec = rec + least(greatest(coalesce((s->>'rec')::int, 0), 0), 40),
    rec_yds = rec_yds + greatest(recy, -30),
    rec_td = rec_td + least(greatest(coalesce((s->>'retd')::int, 0), 0), 12),
    tackles = tackles + least(greatest(coalesce((s->>'tk')::int, 0), 0), 40),
    sacks = sacks + least(greatest(coalesce((s->>'sk')::int, 0), 0), 15),
    ints = ints + least(greatest(coalesce((s->>'int')::int, 0), 0), 10),
    fgm = fgm + least(greatest(coalesce((s->>'fgm')::int, 0), 0), 10),
    fga = fga + least(greatest(coalesce((s->>'fga')::int, 0), 0), 12),
    fg_long = greatest(fg_long, least(greatest(coalesce((s->>'fgl')::int, 0), 0), 68)),
    xpm = xpm + least(greatest(coalesce((s->>'xpm')::int, 0), 0), 12),
    punts = punts + least(greatest(coalesce((s->>'punts')::int, 0), 0), 15),
    punt_yds = punt_yds + least(greatest(coalesce((s->>'puntYds')::int, 0), 0), 1000),
    ut_games = ut_games + case when coalesce((s->>'ut')::int, 0) = 1 then 1 else 0 end,
    ut_wins = ut_wins + case when coalesce((s->>'ut')::int, 0) = 1 and s->>'res' = 'W' then 1 else 0 end,
    ut_tds = ut_tds + case when coalesce((s->>'ut')::int, 0) = 1 then least(greatest(tds, 0), 16) else 0 end,
    ut_pts = ut_pts + case when coalesce((s->>'ut')::int, 0) = 1 then least(greatest(coalesce((s->>'pts')::int, 0), 0), 120) else 0 end,
    on_w = on_w + case when coalesce((s->>'on')::int, 0) = 1 and s->>'res' = 'W' then 1 else 0 end,
    on_l = on_l + case when coalesce((s->>'on')::int, 0) = 1 and s->>'res' = 'L' then 1 else 0 end,
    on_t = on_t + case when coalesce((s->>'on')::int, 0) = 1 and s->>'res' = 'T' then 1 else 0 end,
    ut_l = ut_l + case when coalesce((s->>'ut')::int, 0) = 1 and s->>'res' = 'L' then 1 else 0 end,
    ut_t = ut_t + case when coalesce((s->>'ut')::int, 0) = 1 and s->>'res' = 'T' then 1 else 0 end,
    fr_w = fr_w + case when coalesce((s->>'fr')::int, 0) = 1 and s->>'res' = 'W' then 1 else 0 end,
    fr_l = fr_l + case when coalesce((s->>'fr')::int, 0) = 1 and s->>'res' = 'L' then 1 else 0 end,
    fr_t = fr_t + case when coalesce((s->>'fr')::int, 0) = 1 and s->>'res' = 'T' then 1 else 0 end,
    last_game = now(), updated_at = now()
  where id = uid;
end $$;
revoke all on function public.ek_add_game(jsonb) from public, anon;
grant execute on function public.ek_add_game(jsonb) to authenticated;
notify pgrst, 'reload schema';
