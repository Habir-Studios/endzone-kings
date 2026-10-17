-- Endzone Kings: reports, bans, anti-cheat and the admin panel. Run after social.sql. Safe to run again.
-- The admin is whoever signs in with this email.
create or replace function public.ek_is_admin() returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email') = 'hussainzidan16@gmail.com', false);
$$;

-- ---------- bans ----------
create table if not exists public.ek_bans (
  id uuid primary key references auth.users on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  by_admin boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ek_bans enable row level security;
drop policy if exists "ek_bans read own or admin" on public.ek_bans;
create policy "ek_bans read own or admin" on public.ek_bans for select using (auth.uid() = id or public.ek_is_admin());
drop policy if exists "ek_bans admin write" on public.ek_bans;
create policy "ek_bans admin write" on public.ek_bans for all using (public.ek_is_admin()) with check (public.ek_is_admin());
create or replace function public.ek_banned(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ek_bans where id = uid);
$$;

-- ---------- reports ----------
create table if not exists public.ek_reports (
  id bigint generated always as identity primary key,
  reporter uuid default auth.uid() references auth.users on delete set null,
  target uuid not null references auth.users on delete cascade,
  reason text not null check (reason in ('cheating', 'harassment', 'bad name', 'bad clip', 'spam', 'other', 'auto: anti-cheat')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'banned')),
  created_at timestamptz not null default now()
);
alter table public.ek_reports enable row level security;
drop policy if exists "ek_reports file" on public.ek_reports;
create policy "ek_reports file" on public.ek_reports for insert with check (auth.uid() = reporter and reporter <> target and reason <> 'auto: anti-cheat');
drop policy if exists "ek_reports admin read" on public.ek_reports;
create policy "ek_reports admin read" on public.ek_reports for select using (public.ek_is_admin());
drop policy if exists "ek_reports admin update" on public.ek_reports;
create policy "ek_reports admin update" on public.ek_reports for update using (public.ek_is_admin());
drop policy if exists "ek_reports admin delete" on public.ek_reports;
create policy "ek_reports admin delete" on public.ek_reports for delete using (public.ek_is_admin());
-- one report per person per player per hour
create or replace function public.ek_report_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reporter is not null and exists (select 1 from ek_reports where reporter = new.reporter and target = new.target and created_at > now() - interval '1 hour') then
    raise exception 'You already reported this player recently';
  end if;
  return new;
end $$;
drop trigger if exists ek_report_limit on public.ek_reports;
create trigger ek_report_limit before insert on public.ek_reports for each row execute function public.ek_report_limit();

-- ---------- banned players can't post, message, follow or clip; admin can remove clips ----------
drop policy if exists "ek_messages send" on public.ek_messages;
create policy "ek_messages send" on public.ek_messages for insert with check (auth.uid() = sender and sender <> recipient and not public.ek_banned(auth.uid()));
drop policy if exists "ek_clips post" on public.ek_clips;
create policy "ek_clips post" on public.ek_clips for insert with check (auth.uid() = owner and not public.ek_banned(auth.uid()));
drop policy if exists "ek_clips delete own" on public.ek_clips;
create policy "ek_clips delete own" on public.ek_clips for delete using (auth.uid() = owner or public.ek_is_admin());
drop policy if exists "ek_follows add" on public.ek_follows;
create policy "ek_follows add" on public.ek_follows for insert with check (auth.uid() = follower and not public.ek_banned(auth.uid()));
drop policy if exists "ek_players update own" on public.ek_players;
create policy "ek_players update own" on public.ek_players for update using (auth.uid() = id and not public.ek_banned(auth.uid()));

-- banned players drop off the leaderboards
alter table public.ek_players add column if not exists banned boolean not null default false;
alter table public.ek_players add column if not exists last_game timestamptz;
alter table public.ek_players add column if not exists flags int not null default 0;
create or replace function public.ek_sync_ban() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then update ek_players set banned = false where id = old.id; return old; end if;
  update ek_players set banned = true where id = new.id; return new;
end $$;
drop trigger if exists ek_sync_ban on public.ek_bans;
create trigger ek_sync_ban after insert or delete on public.ek_bans for each row execute function public.ek_sync_ban();

-- ---------- anti-cheat: game stats are checked server side ----------
-- * banned players can't post games
-- * a game needs at least 3 real minutes since the last one
-- * a stat line nobody could put up in one game gets thrown out and auto-reported to the admin; 3 of those is an automatic ban
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
    -- overall record = online 1v1 + Ultimate Team (franchise is tracked on its own and not shown in the overall)
    wins = wins + case when s->>'res' = 'W' and (coalesce((s->>'ut')::int, 0) = 1 or coalesce((s->>'on')::int, 0) = 1) then 1 else 0 end,
    losses = losses + case when s->>'res' = 'L' and (coalesce((s->>'ut')::int, 0) = 1 or coalesce((s->>'on')::int, 0) = 1) then 1 else 0 end,
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

-- admin helpers
create or replace function public.ek_admin_ban(uid uuid, why text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not ek_is_admin() then raise exception 'admins only'; end if;
  insert into ek_bans (id, reason) values (uid, left(coalesce(why, ''), 300)) on conflict (id) do update set reason = excluded.reason;
  update ek_reports set status = 'banned' where target = uid and status = 'open';
end $$;
create or replace function public.ek_admin_unban(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not ek_is_admin() then raise exception 'admins only'; end if;
  delete from ek_bans where id = uid;
  update ek_players set flags = 0 where id = uid;
end $$;
create or replace function public.ek_admin_reset_stats(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not ek_is_admin() then raise exception 'admins only'; end if;
  update ek_players set games = 0, wins = 0, losses = 0, pass_yds = 0, pass_td = 0, rush_yds = 0, rush_td = 0, rec = 0, rec_yds = 0, rec_td = 0,
    tackles = 0, sacks = 0, ints = 0, fgm = 0, fga = 0, fg_long = 0, xpm = 0, punts = 0, punt_yds = 0 where id = uid;
end $$;
grant execute on function public.ek_admin_ban(uuid, text), public.ek_admin_unban(uuid), public.ek_admin_reset_stats(uuid), public.ek_is_admin() to authenticated;
