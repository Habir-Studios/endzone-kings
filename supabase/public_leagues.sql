-- Endzone Kings: public Online Franchise leagues (join from a list, no code needed) and a level 5 requirement.
-- Run once in the SQL editor.
alter table public.ek_leagues add column if not exists public boolean not null default false;
create index if not exists ek_leagues_public_open on public.ek_leagues (created_at desc) where public and status = 'open';

-- level check: Online Franchise unlocks at level 5
create or replace function public.ek_league_level_ok() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select lvl from public.ek_players where id = auth.uid()), 1) >= 5;
$$;

drop function if exists public.ek_league_create(text, int);
create or replace function public.ek_league_create(lname text, lteam int, lpublic boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); code text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.ek_league_level_ok() then raise exception 'Online Franchise unlocks at level 5'; end if;
  if (select count(*) from ek_league_members where player = uid) >= 5 then raise exception 'You can be in 5 leagues at most'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into ek_leagues (id, name, owner, public) values (code, left(lname, 24), uid, coalesce(lpublic, false));
  insert into ek_league_members (league, player, team) values (code, uid, lteam);
  return code;
end $$;

create or replace function public.ek_league_join(code text, lteam int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.ek_league_level_ok() then raise exception 'Online Franchise unlocks at level 5'; end if;
  select * into L from ek_leagues where id = upper(code);
  if L.id is null then raise exception 'No league with that code'; end if;
  if L.status <> 'open' then raise exception 'That league already started'; end if;
  if (select count(*) from ek_league_members where league = L.id) >= 16 then raise exception 'That league is full (16)'; end if;
  if (select count(*) from ek_league_members where player = uid and league <> L.id) >= 5 then raise exception 'You can be in 5 leagues at most'; end if;
  if exists (select 1 from ek_league_members where league = L.id and team = lteam and player <> uid) then raise exception 'Someone already has that team'; end if;
  insert into ek_league_members (league, player, team) values (L.id, uid, lteam) on conflict (league, player) do update set team = excluded.team;
end $$;

revoke all on function public.ek_league_create(text, int, boolean) from public;
grant execute on function public.ek_league_create(text, int, boolean) to authenticated;
grant execute on function public.ek_league_join(text, int) to authenticated;
grant execute on function public.ek_league_level_ok() to authenticated;
select count(*) as cols from information_schema.columns where table_name = 'ek_leagues' and column_name = 'public';
