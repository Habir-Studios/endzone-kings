-- Endzone Kings: sign up checks the username isn't already taken (anyone can ask, it only answers yes or no).
create or replace function public.ek_name_taken(p_name text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users u where lower(u.raw_user_meta_data->>'username') = lower(trim(p_name)))
      or exists (select 1 from public.ek_players p where lower(p.name) = lower(trim(p_name)));
$$;
revoke all on function public.ek_name_taken(text) from public;
grant execute on function public.ek_name_taken(text) to anon, authenticated;
