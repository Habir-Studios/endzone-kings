-- Endzone Kings: log in and reset your password with your USERNAME (not just email).
-- Run once in the Supabase SQL editor. Nobody ever gets to see another player's email:
--   ek_login_email   only hands back the email when the password is right (then the game logs in normally)
--   ek_reset_by_username asks Supabase Auth to send the reset email itself and only returns a hidden email (h***@gmail.com)
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.ek_login_email(p_user text, p_pw text)
returns text language plpgsql security definer
set search_path = public, extensions, auth as $$
declare e text; h text;
begin
  select u.email, u.encrypted_password into e, h from auth.users u
   where lower(u.raw_user_meta_data->>'username') = lower(trim(p_user))
   order by u.created_at limit 1;
  if e is null or h is null or h <> extensions.crypt(p_pw, h) then
    perform pg_sleep(0.4);   -- slows down password guessing
    return null;
  end if;
  return e;
end $$;

create or replace function public.ek_reset_by_username(p_user text)
returns text language plpgsql security definer
set search_path = public, extensions, auth as $$
declare e text;
begin
  select u.email into e from auth.users u
   where lower(u.raw_user_meta_data->>'username') = lower(trim(p_user))
   order by u.created_at limit 1;
  if e is null then return null; end if;
  perform net.http_post(
    url := 'https://dhtnuisxbnmcnjgsiihn.supabase.co/auth/v1/recover?redirect_to=' || 'https%3A%2F%2Fhabir-studios.github.io%2Fendzone-kings%2F',
    body := jsonb_build_object('email', e),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_hK16PxzdeuCc5l65cE-u-g_qd3oqm5A')
  );
  return regexp_replace(e, '^(.)[^@]*(@.*)$', '\1***\2');
end $$;

revoke all on function public.ek_login_email(text, text) from public;
revoke all on function public.ek_reset_by_username(text) from public;
grant execute on function public.ek_login_email(text, text) to anon, authenticated;
grant execute on function public.ek_reset_by_username(text) to anon, authenticated;
