-- Fix: the backfill cut every new player name to 3 letters (rpad truncates). Use the full username (3 to 16 characters).
create or replace function public.ek_name_for(u auth.users) returns text language sql immutable as $$
  select case when length(n) < 3 then rpad(n, 3, '0') else left(n, 16) end
    from (select regexp_replace(coalesce(nullif(u.raw_user_meta_data->>'username', ''), split_part(u.email, '@', 1), 'Player'), '[^A-Za-z0-9_]', '', 'g') as n) x;
$$;
update public.ek_players p set name = public.ek_name_for(u)
  from auth.users u
 where u.id = p.id and length(p.name) = 3 and length(public.ek_name_for(u)) > 3 and left(public.ek_name_for(u), 3) = p.name;
select string_agg(name, ', ' order by name) as names from public.ek_players;
