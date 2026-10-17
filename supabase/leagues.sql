-- Leagues: up to 12 friends each run a team and play a season against each other.
-- Reads are public; every write goes through these functions so nobody can fake a result.
create table if not exists public.ek_leagues (
  id text primary key,
  name text not null check (char_length(name) between 2 and 24),
  owner uuid not null references auth.users(id) on delete cascade,
  size int not null default 12 check (size between 2 and 12),
  status text not null default 'open',
  season jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.ek_league_members (
  league text not null references public.ek_leagues(id) on delete cascade,
  player uuid not null references auth.users(id) on delete cascade,
  team int not null,
  joined_at timestamptz not null default now(),
  primary key (league, player),
  unique (league, team)
);
alter table public.ek_leagues enable row level security;
alter table public.ek_league_members enable row level security;
drop policy if exists "leagues read" on public.ek_leagues;
drop policy if exists "league members read" on public.ek_league_members;
create policy "leagues read" on public.ek_leagues for select using (true);
create policy "league members read" on public.ek_league_members for select using (true);
grant select on public.ek_leagues, public.ek_league_members to anon, authenticated;

create or replace function public.ek_league_create(lname text, lsize int, lteam int) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); code text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from ek_league_members where player = uid) >= 5 then raise exception 'You can be in 5 leagues at most'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into ek_leagues (id, name, owner, size) values (code, left(lname, 24), uid, greatest(2, least(12, lsize)));
  insert into ek_league_members (league, player, team) values (code, uid, lteam);
  return code;
end $$;

create or replace function public.ek_league_join(code text, lteam int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into L from ek_leagues where id = upper(code);
  if L.id is null then raise exception 'No league with that code'; end if;
  if L.status <> 'open' then raise exception 'That league already started its season'; end if;
  if (select count(*) from ek_league_members where league = L.id) >= L.size then raise exception 'That league is full'; end if;
  if exists (select 1 from ek_league_members where league = L.id and team = lteam) then raise exception 'Someone already has that team'; end if;
  insert into ek_league_members (league, player, team) values (L.id, uid, lteam) on conflict (league, player) do update set team = excluded.team;
end $$;

create or replace function public.ek_league_leave(code text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues;
begin
  select * into L from ek_leagues where id = upper(code);
  if L.id is null then return; end if;
  if L.owner = uid then delete from ek_leagues where id = L.id; return; end if;   -- the commissioner leaving closes the league
  if L.status <> 'open' then raise exception 'You can''t leave in the middle of a season'; end if;
  delete from ek_league_members where league = L.id and player = uid;
end $$;

-- the commissioner starts the season or moves it along (sims unplayed games); they're the only one who can
create or replace function public.ek_league_set(code text, s jsonb, st text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues;
begin
  select * into L from ek_leagues where id = upper(code);
  if L.id is null or L.owner <> uid then raise exception 'Only the commissioner can do that'; end if;
  if st not in ('season', 'done') then raise exception 'bad status'; end if;
  update ek_leagues set season = s, status = st where id = L.id;
end $$;

-- a finished league game: only one of the two players in it can report it, and only once
create or replace function public.ek_league_report(code text, wk int, gi int, hs int, aws int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues; g jsonb; path text[];
begin
  select * into L from ek_leagues where id = upper(code) for update;
  if L.id is null or L.season is null then raise exception 'No season'; end if;
  path := array['weeks', wk::text, gi::text];
  g := L.season #> path;
  if g is null then raise exception 'No such game'; end if;
  if (g->>'h')::uuid <> uid and (g->>'a')::uuid <> uid then raise exception 'You are not in that game'; end if;
  if g ? 'hs' and g->>'hs' is not null then return; end if;
  update ek_leagues set season = jsonb_set(season, path, g || jsonb_build_object('hs', least(greatest(hs, 0), 150), 'as', least(greatest(aws, 0), 150), 'by', uid)) where id = L.id;
end $$;

revoke all on function public.ek_league_create(text, int, int), public.ek_league_join(text, int), public.ek_league_leave(text), public.ek_league_set(text, jsonb, text), public.ek_league_report(text, int, int, int, int) from public, anon;
grant execute on function public.ek_league_create(text, int, int), public.ek_league_join(text, int), public.ek_league_leave(text), public.ek_league_set(text, jsonb, text), public.ek_league_report(text, int, int, int, int) to authenticated;
