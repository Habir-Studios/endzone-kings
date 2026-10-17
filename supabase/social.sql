-- Endzone Kings: global leaderboards, public profiles, follows, messages and clips.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- ---------- public profiles + career stats ----------
create table if not exists public.ek_players (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 3 and 16),
  bio text not null default '' check (char_length(bio) <= 160),
  team int not null default 3 check (team between 0 and 31),
  lvl int not null default 1, rp int not null default 0,
  games int not null default 0, wins int not null default 0, losses int not null default 0,
  pass_yds int not null default 0, pass_td int not null default 0,
  rush_yds int not null default 0, rush_td int not null default 0,
  rec int not null default 0, rec_yds int not null default 0, rec_td int not null default 0,
  tackles int not null default 0, sacks int not null default 0, ints int not null default 0,
  fgm int not null default 0, fga int not null default 0, fg_long int not null default 0,
  xpm int not null default 0, punts int not null default 0, punt_yds int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ek_players enable row level security;
drop policy if exists "ek_players read" on public.ek_players;
create policy "ek_players read" on public.ek_players for select using (true);
drop policy if exists "ek_players insert own" on public.ek_players;
create policy "ek_players insert own" on public.ek_players for insert with check (auth.uid() = id);
drop policy if exists "ek_players update own" on public.ek_players;
create policy "ek_players update own" on public.ek_players for update using (auth.uid() = id);
-- players can only edit their name, bio, team, level and rank directly; stats only go up through ek_add_game
revoke insert, update on public.ek_players from anon, authenticated;
grant insert (id, name, bio, team, lvl, rp) on public.ek_players to authenticated;
grant update (name, bio, team, lvl, rp, updated_at) on public.ek_players to authenticated;
create index if not exists ek_players_name on public.ek_players (lower(name));

-- add one finished game's stats (capped per game so nobody can post a 9,000 yard game)
create or replace function public.ek_add_game(s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  c int := 1;
  v int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into ek_players (id, name) values (auth.uid(), coalesce(nullif(left(s->>'name', 16), ''), 'Player'))
    on conflict (id) do nothing;
  update ek_players set
    games = games + 1,
    wins = wins + case when s->>'res' = 'W' then 1 else 0 end,
    losses = losses + case when s->>'res' = 'L' then 1 else 0 end,
    pass_yds = pass_yds + least(greatest(coalesce((s->>'py')::int, 0), -50), 900),
    pass_td = pass_td + least(greatest(coalesce((s->>'ptd')::int, 0), 0), 12),
    rush_yds = rush_yds + least(greatest(coalesce((s->>'ry')::int, 0), -50), 600),
    rush_td = rush_td + least(greatest(coalesce((s->>'rtd')::int, 0), 0), 10),
    rec = rec + least(greatest(coalesce((s->>'rec')::int, 0), 0), 40),
    rec_yds = rec_yds + least(greatest(coalesce((s->>'recy')::int, 0), -30), 900),
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
    updated_at = now()
  where id = auth.uid();
end $$;
revoke all on function public.ek_add_game(jsonb) from public, anon;
grant execute on function public.ek_add_game(jsonb) to authenticated;

-- ---------- follows ----------
create table if not exists public.ek_follows (
  follower uuid not null references auth.users on delete cascade,
  followee uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
alter table public.ek_follows enable row level security;
drop policy if exists "ek_follows read" on public.ek_follows;
create policy "ek_follows read" on public.ek_follows for select using (true);
drop policy if exists "ek_follows add" on public.ek_follows;
create policy "ek_follows add" on public.ek_follows for insert with check (auth.uid() = follower);
drop policy if exists "ek_follows remove" on public.ek_follows;
create policy "ek_follows remove" on public.ek_follows for delete using (auth.uid() = follower);

-- ---------- direct messages ----------
create table if not exists public.ek_messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  recipient uuid not null references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.ek_messages enable row level security;
drop policy if exists "ek_messages read own" on public.ek_messages;
create policy "ek_messages read own" on public.ek_messages for select using (auth.uid() = sender or auth.uid() = recipient);
drop policy if exists "ek_messages send" on public.ek_messages;
create policy "ek_messages send" on public.ek_messages for insert with check (auth.uid() = sender and sender <> recipient);
drop policy if exists "ek_messages mark read" on public.ek_messages;
create policy "ek_messages mark read" on public.ek_messages for update using (auth.uid() = recipient);
revoke update on public.ek_messages from anon, authenticated;
grant update (read) on public.ek_messages to authenticated;
create index if not exists ek_messages_pair on public.ek_messages (recipient, sender, created_at desc);

-- ---------- clips ----------
create table if not exists public.ek_clips (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  teams int[] not null default '{}',
  secs real not null default 0,
  data text not null check (char_length(data) <= 600000),
  views int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ek_clips enable row level security;
drop policy if exists "ek_clips read" on public.ek_clips;
create policy "ek_clips read" on public.ek_clips for select using (true);
drop policy if exists "ek_clips post" on public.ek_clips;
create policy "ek_clips post" on public.ek_clips for insert with check (auth.uid() = owner);
drop policy if exists "ek_clips delete own" on public.ek_clips;
create policy "ek_clips delete own" on public.ek_clips for delete using (auth.uid() = owner);
create index if not exists ek_clips_owner on public.ek_clips (owner, created_at desc);

-- at most 30 clips per player
create or replace function public.ek_clip_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from ek_clips where owner = new.owner) >= 30 then raise exception 'clip limit reached (30). Delete one first'; end if;
  return new;
end $$;
drop trigger if exists ek_clip_limit on public.ek_clips;
create trigger ek_clip_limit before insert on public.ek_clips for each row execute function public.ek_clip_limit();

-- count a view
create or replace function public.ek_clip_view(cid bigint) returns void language sql security definer set search_path = public as $$
  update ek_clips set views = views + 1 where id = cid;
$$;
grant execute on function public.ek_clip_view(bigint) to anon, authenticated;

-- live updates for new messages
do $$ begin
  begin alter publication supabase_realtime add table public.ek_messages; exception when duplicate_object then null; end;
end $$;
