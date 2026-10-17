-- Endzone Kings: timed bans and kicking a player out of their current game. Run after admin.sql. Safe to run again.

-- bans can expire: until = null means permanent
alter table public.ek_bans add column if not exists until timestamptz;
create or replace function public.ek_banned(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ek_bans where id = uid and (until is null or until > now()));
$$;

drop function if exists public.ek_admin_ban(uuid, text);
create or replace function public.ek_admin_ban(uid uuid, why text, hours int default 0) returns void language plpgsql security definer set search_path = public as $$
begin
  if not ek_is_admin() then raise exception 'admins only'; end if;
  insert into ek_bans (id, reason, until, created_at)
    values (uid, left(coalesce(why, ''), 300), case when coalesce(hours, 0) > 0 then now() + make_interval(hours => hours) else null end, now())
    on conflict (id) do update set reason = excluded.reason, until = excluded.until, created_at = now();
  update ek_players set banned = true where id = uid;
  update ek_reports set status = 'banned' where target = uid and status = 'open';
end $$;
revoke all on function public.ek_admin_ban(uuid, text, int) from public, anon;
grant execute on function public.ek_admin_ban(uuid, text, int) to authenticated;

-- a player checking their own ban; an expired ban is cleared on the spot
create or replace function public.ek_my_ban() returns table (reason text, until timestamptz) language plpgsql security definer set search_path = public as $$
begin
  delete from ek_bans where id = auth.uid() and until is not null and until <= now();
  return query select b.reason, b.until from ek_bans b where b.id = auth.uid();
end $$;
revoke all on function public.ek_my_ban() from public, anon;
grant execute on function public.ek_my_ban() to authenticated;

-- expired bans also get cleaned up whenever the admin looks at the list
create or replace function public.ek_admin_clean_bans() returns void language plpgsql security definer set search_path = public as $$
begin
  if not ek_is_admin() then raise exception 'admins only'; end if;
  delete from ek_bans where until is not null and until <= now();
end $$;
grant execute on function public.ek_admin_clean_bans() to authenticated;

-- kicks: only the admin can send one; the player's game listens for it and leaves the match
create table if not exists public.ek_kicks (
  id bigint generated always as identity primary key,
  target uuid not null references auth.users on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now()
);
alter table public.ek_kicks enable row level security;
drop policy if exists "ek_kicks read own" on public.ek_kicks;
create policy "ek_kicks read own" on public.ek_kicks for select using (auth.uid() = target or public.ek_is_admin());
drop policy if exists "ek_kicks admin send" on public.ek_kicks;
create policy "ek_kicks admin send" on public.ek_kicks for insert with check (public.ek_is_admin());
grant select, insert on public.ek_kicks to authenticated;
grant usage, select on all sequences in schema public to authenticated;
create index if not exists ek_kicks_target on public.ek_kicks (target, created_at desc);
do $$ begin
  alter publication supabase_realtime add table public.ek_kicks;
exception when duplicate_object then null; when undefined_object then null; end $$;
notify pgrst, 'reload schema';
