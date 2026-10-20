-- Endzone Kings: delete your own account from Settings. If two-step login is on, the session must have just passed a
-- fresh authenticator code (aal2); a remembered device isn't enough. The owner account can't be deleted this way.
create or replace function public.ek_delete_me() returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if uid = 'e752f854-2dce-4a38-ab93-54bcb963dc14'::uuid then raise exception 'The owner account can''t be deleted here'; end if;
  if exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified')
     and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then raise exception 'Type your authenticator code first'; end if;
  -- everything tied to the account (tables that don't cascade on their own)
  begin delete from public.ek_saves where id = uid; exception when others then null; end;
  begin delete from public.ek_game_log where player = uid; exception when others then null; end;
  begin delete from public.ek_follows where follower = uid or followee = uid; exception when others then null; end;
  begin delete from public.ek_messages where sender = uid or recipient = uid; exception when others then null; end;
  begin delete from public.ek_crew_members where player = uid; exception when others then null; end;
  begin delete from public.ek_clubs where id = uid; exception when others then null; end;
  begin delete from public.ek_league_members where player = uid; exception when others then null; end;
  begin delete from public.ek_trusted_devices where user_id = uid; exception when others then null; end;
  begin delete from public.ek_trusted_sessions where user_id = uid; exception when others then null; end;
  begin delete from public.ek_players where id = uid; exception when others then null; end;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.ek_delete_me() from public;
grant execute on function public.ek_delete_me() to authenticated;
select count(*) as fn from pg_proc where proname = 'ek_delete_me';
