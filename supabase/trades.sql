-- Endzone Kings: player-to-player trades for Ultimate Team (cards, unopened packs, coins, Training Points).
-- The sender's items are held (taken out of their club) while the trade is pending. Every status change goes
-- through a function below so a trade can only be accepted once and only paid out once. Safe to run again.
create table if not exists public.ek_trades (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  recipient uuid not null references auth.users on delete cascade,
  offer jsonb not null default '{}'::jsonb check (pg_column_size(offer) < 8000),
  ask jsonb not null default '{}'::jsonb check (pg_column_size(ask) < 4000),
  note text not null default '' check (char_length(note) <= 120),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed', 'returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ek_trades enable row level security;
drop policy if exists "ek_trades read own" on public.ek_trades;
create policy "ek_trades read own" on public.ek_trades for select using (auth.uid() = sender or auth.uid() = recipient or public.ek_is_admin());
drop policy if exists "ek_trades send" on public.ek_trades;
create policy "ek_trades send" on public.ek_trades for insert with check (auth.uid() = sender and sender <> recipient and status = 'pending' and not public.ek_banned(auth.uid()));
grant select, insert on public.ek_trades to authenticated;
grant usage, select on all sequences in schema public to authenticated;
create index if not exists ek_trades_sender on public.ek_trades (sender, status);
create index if not exists ek_trades_recipient on public.ek_trades (recipient, status);

-- at most 10 open trades per player
create or replace function public.ek_trade_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from ek_trades where sender = new.sender and status = 'pending') >= 10 then raise exception 'You already have 10 open trades. Cancel one first'; end if;
  return new;
end $$;
drop trigger if exists ek_trade_limit on public.ek_trades;
create trigger ek_trade_limit before insert on public.ek_trades for each row execute function public.ek_trade_limit();

-- recipient accepts or declines (only while pending)
create or replace function public.ek_trade_respond(tid bigint, yes boolean) returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if ek_banned(auth.uid()) then raise exception 'banned'; end if;
  update ek_trades set status = case when yes then 'accepted' else 'declined' end, updated_at = now()
    where id = tid and recipient = auth.uid() and status = 'pending';
  get diagnostics n = row_count; return n = 1;
end $$;
-- sender cancels (only while pending)
create or replace function public.ek_trade_cancel(tid bigint) returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update ek_trades set status = 'cancelled', updated_at = now() where id = tid and sender = auth.uid() and status = 'pending';
  get diagnostics n = row_count; return n = 1;
end $$;
-- sender collects: what they asked for (accepted) or their own items back (declined / cancelled). Works once.
create or replace function public.ek_trade_settle(tid bigint) returns text language plpgsql security definer set search_path = public as $$
declare s text;
begin
  update ek_trades set status = case when status = 'accepted' then 'completed' else 'returned' end, updated_at = now()
    where id = tid and sender = auth.uid() and status in ('accepted', 'declined', 'cancelled')
    returning status into s;
  return s;
end $$;
revoke all on function public.ek_trade_respond(bigint, boolean), public.ek_trade_cancel(bigint), public.ek_trade_settle(bigint) from public, anon;
grant execute on function public.ek_trade_respond(bigint, boolean), public.ek_trade_cancel(bigint), public.ek_trade_settle(bigint) to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.ek_trades;
exception when duplicate_object then null; when undefined_object then null; end $$;
notify pgrst, 'reload schema';
