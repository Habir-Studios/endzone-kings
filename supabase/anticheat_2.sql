-- Endzone Kings anti-cheat, round 2. Run once in the SQL editor.
-- * the "impossible stats" limits grow with quarter length, so a long game can't flag a skilled player
-- * online games: the host's and the other player's reports are compared; a result that doesn't match the host's gets flagged
-- * ek_add_game now answers 'ok', 'flagged' or 'too soon' so the game can tell the player after the game
create table if not exists public.ek_match_reports (
  match text not null, player uuid not null references auth.users on delete cascade, host boolean not null default false,
  sc_me int not null default 0, sc_opp int not null default 0, created_at timestamptz not null default now(),
  primary key (match, player)
);
alter table public.ek_match_reports enable row level security;
revoke all on public.ek_match_reports from anon, authenticated;
delete from public.ek_match_reports where created_at < now() - interval '30 days';
drop function if exists public.ek_add_game(jsonb);
create or replace function public.ek_add_game(s jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  last timestamptz;
  bad text := '';
  fl int;
  py int := coalesce((s->>'py')::int, 0); ry int := coalesce((s->>'ry')::int, 0); recy int := coalesce((s->>'recy')::int, 0);
  tds int := coalesce((s->>'ptd')::int, 0) + coalesce((s->>'rtd')::int, 0) + coalesce((s->>'retd')::int, 0);
  secs int := coalesce((s->>'secs')::int, 0); qlen int := coalesce((s->>'qlen')::int, 120);
  mins numeric := greatest(4, 4 * coalesce((s->>'qlen')::int, 120) / 60.0);
  mid text := left(nullif(s->>'mid', ''), 40); other record;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if ek_banned(uid) then raise exception 'banned'; end if;
  insert into ek_players (id, name) values (uid, coalesce(nullif(left(s->>'name', 16), ''), 'Player')) on conflict (id) do nothing;
  select last_game into last from ek_players where id = uid;
  if last is not null and last > now() - interval '3 minutes' then return 'too soon'; end if;
  if py > greatest(900, 120 * mins) or ry > greatest(600, 90 * mins) or recy > greatest(900, 120 * mins) or tds > greatest(16, 2.5 * mins)
     or coalesce((s->>'sk')::int, 0) > greatest(15, 2 * mins) or coalesce((s->>'int')::int, 0) > greatest(10, 1.5 * mins) then bad := 'impossible stat line'; end if;
  -- online games: both players report the same game. The host runs the game, so if the other player's score doesn't
  -- match the host's report, the other player edited their result
  if mid is not null and coalesce((s->>'on')::int, 0) = 1 then
    insert into public.ek_match_reports (match, player, host, sc_me, sc_opp) values (mid, uid, coalesce((s->>'host')::int, 0) = 1, coalesce((s->>'pts')::int, 0), coalesce((s->>'opp')::int, 0))
      on conflict (match, player) do nothing;
    select * into other from public.ek_match_reports r where r.match = mid and r.player <> uid limit 1;
    if other.player is not null and coalesce((s->>'host')::int, 0) = 0 and other.host
       and (other.sc_me <> coalesce((s->>'opp')::int, 0) or other.sc_opp <> coalesce((s->>'pts')::int, 0)) then bad := 'online result didn''t match the host''s'; end if;
    -- the host reported second: check the other player's earlier report against this one
    if other.player is not null and coalesce((s->>'host')::int, 0) = 1 and not other.host
       and (other.sc_me <> coalesce((s->>'opp')::int, 0) or other.sc_opp <> coalesce((s->>'pts')::int, 0)) then
      update ek_players set flags = flags + 1 where id = other.player;
      insert into ek_reports (reporter, target, reason, details) values (null, other.player, 'auto: anti-cheat', 'online result didn''t match the host''s: match ' || mid);
      if (select flags from ek_players where id = other.player) >= 3 then insert into ek_bans (id, reason, by_admin) values (other.player, 'Automatic anti-cheat ban (online result didn''t match the host''s)', false) on conflict (id) do nothing; end if;
    end if;
  end if;
  if secs > 0 and secs < qlen * 2 then bad := 'game finished faster than its clock'; end if;
  if recy > py + 60 then bad := 'more receiving yards than passing yards'; end if;
  if coalesce((s->>'ac')::int, 0) > 0 then bad := 'in-game integrity check failed: ' || left(coalesce(s->>'acWhy', ''), 120); end if;
  if bad <> '' then
    update ek_players set flags = flags + 1, last_game = now() where id = uid returning flags into fl;
    insert into ek_reports (reporter, target, reason, details) values (null, uid, 'auto: anti-cheat', bad || ': ' || left(s::text, 400));
    if fl >= 3 then insert into ek_bans (id, reason, by_admin) values (uid, 'Automatic anti-cheat ban (' || bad || ')', false) on conflict (id) do nothing; end if;
    return 'flagged';
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
  return 'ok';
end $$;
revoke all on function public.ek_add_game(jsonb) from public, anon;
grant execute on function public.ek_add_game(jsonb) to authenticated;
select pg_get_function_result('public.ek_add_game(jsonb)'::regprocedure) as returns;
