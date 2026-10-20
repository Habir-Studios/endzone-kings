-- Endzone Kings: every account gets a public player row (so search, messages and lookups find everyone),
-- now and for every new signup. Plus: the owner can send messages under any name; admins always send as themselves.
create or replace function public.ek_name_for(u auth.users) returns text language sql immutable as $$
  select left(rpad(regexp_replace(coalesce(nullif(u.raw_user_meta_data->>'username', ''), split_part(u.email, '@', 1), 'Player'), '[^A-Za-z0-9_]', '', 'g'), 3, '0'), 16);
$$;
insert into public.ek_players (id, name)
  select u.id, public.ek_name_for(u) from auth.users u
   where coalesce(u.is_anonymous, false) = false and not exists (select 1 from public.ek_players p where p.id = u.id)
  on conflict do nothing;
create or replace function public.ek_new_user_player() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  insert into public.ek_players (id, name) values (new.id, public.ek_name_for(new)) on conflict do nothing;
  return new;
exception when others then return new;   -- never block a signup over this
end $$;
drop trigger if exists ek_new_user_player on auth.users;
create trigger ek_new_user_player after insert on auth.users for each row execute function public.ek_new_user_player();

alter table public.ek_announcements add column if not exists show_badge boolean not null default true;
drop policy if exists "ek_announcements admin write" on public.ek_announcements;
create policy "ek_announcements admin write" on public.ek_announcements for insert with check (
  author = auth.uid() and (
    auth.uid() = 'e752f854-2dce-4a38-ab93-54bcb963dc14'::uuid
    or (public.ek_is_admin() and targets is not null and cardinality(targets) between 1 and 50
        and show_badge and name = (select p.name from public.ek_players p where p.id = auth.uid()))
  ));
select (select count(*) from public.ek_players) as player_rows, (select count(*) from auth.users) as accounts;
