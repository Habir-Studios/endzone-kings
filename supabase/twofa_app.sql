-- Endzone Kings: two-step login with an authenticator app (Supabase MFA / TOTP). Run once in the SQL editor.
-- If an account has an authenticator set up, its session must be verified with the code (aal2) before it can
-- read or change game data. Accounts without 2FA are unaffected. Restrictive policies stack on top of the old ones.
create or replace function public.ek_mfa_ok() returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
grant execute on function public.ek_mfa_ok() to anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['ek_saves','ek_players','ek_clubs','ek_trades','ek_messages','ek_follows','ek_clips','ek_clip_likes','ek_league_members','ek_crew_members','ek_reports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "ek 2fa gate" on public.%I', t);
      execute format('create policy "ek 2fa gate" on public.%I as restrictive for all to authenticated using (public.ek_mfa_ok()) with check (public.ek_mfa_ok())', t);
    end if;
  end loop;
end $$;
select count(*) as gated from pg_policies where policyname = 'ek 2fa gate';
