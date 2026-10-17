-- Crews: groups of friends with a combined leaderboard. Everyone can see crews; you can only join/leave yourself.
create table if not exists public.ek_crews (
  id text primary key,
  name text not null check (char_length(name) between 2 and 20),
  tag text not null check (char_length(tag) between 2 and 4),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.ek_crew_members (
  player uuid primary key references auth.users(id) on delete cascade,
  crew text not null references public.ek_crews(id) on delete cascade,
  joined_at timestamptz not null default now()
);
alter table public.ek_crews enable row level security;
alter table public.ek_crew_members enable row level security;
drop policy if exists "crews read" on public.ek_crews;
drop policy if exists "crews create" on public.ek_crews;
drop policy if exists "crews delete" on public.ek_crews;
create policy "crews read" on public.ek_crews for select using (true);
create policy "crews create" on public.ek_crews for insert with check (owner = auth.uid());
create policy "crews delete" on public.ek_crews for delete using (owner = auth.uid());
drop policy if exists "crew members read" on public.ek_crew_members;
drop policy if exists "crew members join" on public.ek_crew_members;
drop policy if exists "crew members leave" on public.ek_crew_members;
create policy "crew members read" on public.ek_crew_members for select using (true);
create policy "crew members join" on public.ek_crew_members for insert with check (player = auth.uid() and (select count(*) from public.ek_crew_members m where m.crew = crew) < 20);
create policy "crew members leave" on public.ek_crew_members for delete using (player = auth.uid() or exists (select 1 from public.ek_crews c where c.id = crew and c.owner = auth.uid()));
grant select on public.ek_crews, public.ek_crew_members to anon, authenticated;
grant insert, delete on public.ek_crews, public.ek_crew_members to authenticated;
