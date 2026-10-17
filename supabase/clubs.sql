-- Endzone Kings: a server copy of each player's Ultimate Team club, so other players can see it and ask for
-- specific cards in a trade. Safe to run again.
create table if not exists public.ek_clubs (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '' check (char_length(name) <= 16),
  cards jsonb not null default '[]'::jsonb check (pg_column_size(cards) < 60000),
  lineup jsonb not null default '[]'::jsonb,
  packs jsonb not null default '{}'::jsonb,
  ovr int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ek_clubs enable row level security;
drop policy if exists "ek_clubs read" on public.ek_clubs;
create policy "ek_clubs read" on public.ek_clubs for select using (true);
drop policy if exists "ek_clubs write own" on public.ek_clubs;
create policy "ek_clubs write own" on public.ek_clubs for insert with check (auth.uid() = id and not public.ek_banned(auth.uid()));
drop policy if exists "ek_clubs update own" on public.ek_clubs;
create policy "ek_clubs update own" on public.ek_clubs for update using (auth.uid() = id and not public.ek_banned(auth.uid()));
grant select on public.ek_clubs to anon, authenticated;
grant insert, update on public.ek_clubs to authenticated;
notify pgrst, 'reload schema';
