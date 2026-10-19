-- Endzone Kings: see the devices logged into your account and log them out. Run once in the SQL editor.
create or replace function public.ek_my_sessions()
returns table (id uuid, created_at timestamptz, last_active timestamptz, user_agent text, current boolean)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.created_at, coalesce(s.refreshed_at, s.updated_at, s.created_at), s.user_agent,
         s.id::text = coalesce(auth.jwt()->>'session_id', '')
    from auth.sessions s where s.user_id = auth.uid() and public.ek_mfa_ok()
   order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc;
$$;
-- log one device out (its refresh token dies with the session; the game on that device notices within ~30s)
create or replace function public.ek_kick_session(p_id uuid) returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.ek_mfa_ok() then raise exception 'Finish two-step login first'; end if;
  delete from auth.sessions where id = p_id and user_id = auth.uid();
  return found;
end $$;
create or replace function public.ek_kick_others() returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  if not public.ek_mfa_ok() then raise exception 'Finish two-step login first'; end if;
  delete from auth.sessions where user_id = auth.uid() and id::text <> coalesce(auth.jwt()->>'session_id', '');
  get diagnostics n = row_count; return n;
end $$;
-- is my session still alive? (false = I got logged out from another device)
create or replace function public.ek_session_alive() returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.sessions where id::text = coalesce(auth.jwt()->>'session_id', '') and user_id = auth.uid());
$$;
revoke all on function public.ek_my_sessions() from public;
revoke all on function public.ek_kick_session(uuid) from public;
revoke all on function public.ek_kick_others() from public;
revoke all on function public.ek_session_alive() from public;
grant execute on function public.ek_my_sessions() to authenticated;
grant execute on function public.ek_kick_session(uuid) to authenticated;
grant execute on function public.ek_kick_others() to authenticated;
grant execute on function public.ek_session_alive() to authenticated;
select count(*) as fns from pg_proc where proname in ('ek_my_sessions','ek_kick_session','ek_kick_others','ek_session_alive');
