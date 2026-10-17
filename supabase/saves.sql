-- Cloud saves: one row per account holding the whole progression save (coins, TP, Ultimate Team, franchise, season).
-- Only the owner can read or write their row.
create table if not exists public.ek_saves (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  prog bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ek_saves enable row level security;
drop policy if exists "own save read" on public.ek_saves;
drop policy if exists "own save insert" on public.ek_saves;
drop policy if exists "own save update" on public.ek_saves;
create policy "own save read" on public.ek_saves for select using (auth.uid() = id);
create policy "own save insert" on public.ek_saves for insert with check (auth.uid() = id);
create policy "own save update" on public.ek_saves for update using (auth.uid() = id) with check (auth.uid() = id);
grant select, insert, update on public.ek_saves to authenticated;
