-- Endzone Kings: change your username from Settings. Run once in the SQL editor.
-- Same rules as sign up (3-16 letters, numbers or _), it can't be someone else's name, and you can change it once every 7 days.
-- It updates both your login username and the name everyone sees.
alter table public.ek_players add column if not exists name_changed_at timestamptz;
create or replace function public.ek_change_username(p_name text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); n text := trim(coalesce(p_name, '')); last timestamptz; cur text;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if n !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'Usernames are 3-16 letters, numbers or _'; end if;
  select raw_user_meta_data->>'username' into cur from auth.users where id = uid;
  if lower(coalesce(cur, '')) = lower(n) and cur = n then raise exception 'That''s already your username'; end if;
  if lower(coalesce(cur, '')) <> lower(n) and (
       exists (select 1 from auth.users u where u.id <> uid and lower(u.raw_user_meta_data->>'username') = lower(n))
    or exists (select 1 from public.ek_players p where p.id <> uid and lower(p.name) = lower(n))) then
    raise exception 'That username is taken';
  end if;
  select name_changed_at into last from public.ek_players where id = uid;
  if last is not null and last > now() - interval '7 days' then
    raise exception 'You can change your username again in % days', ceil(extract(epoch from (last + interval '7 days' - now())) / 86400)::int;
  end if;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', n) where id = uid;
  insert into public.ek_players (id, name) values (uid, n) on conflict (id) do update set name = excluded.name;
  update public.ek_players set name_changed_at = now() where id = uid;
  return n;
end $$;
revoke all on function public.ek_change_username(text) from public, anon;
grant execute on function public.ek_change_username(text) to authenticated;
select 'ok' as ready;
