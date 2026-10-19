-- Endzone Kings: two-step login with an email code. Run once in the Supabase SQL editor.
-- Codes come from Supabase Auth's own email code (signInWithOtp / verifyOtp), so the game never stores codes.
-- Turning 2FA on or off needs a session that was signed in with an email code in the last 10 minutes.
create table if not exists public.ek_2fa (id uuid primary key references auth.users on delete cascade, enabled boolean not null default false, updated_at timestamptz not null default now());
alter table public.ek_2fa enable row level security;
revoke all on public.ek_2fa from anon, authenticated;

-- log in step 1: checks the password WITHOUT making a session; returns the email and whether a code is needed
create or replace function public.ek_login_check(p_user text, p_pw text)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid; e text; h text; tf boolean;
begin
  if position('@' in p_user) > 0 then
    select u.id, u.email, u.encrypted_password into uid, e, h from auth.users u where lower(u.email) = lower(trim(p_user)) limit 1;
  else
    select u.id, u.email, u.encrypted_password into uid, e, h from auth.users u where lower(u.raw_user_meta_data->>'username') = lower(trim(p_user)) order by u.created_at limit 1;
  end if;
  if e is null or h is null or h <> extensions.crypt(p_pw, h) then perform pg_sleep(0.4); return null; end if;
  select coalesce(t.enabled, false) into tf from public.ek_2fa t where t.id = uid;
  return jsonb_build_object('email', e, 'twofa', coalesce(tf, false), 'hint', regexp_replace(e, '^(.)[^@]*(@.*)$', '\1***\2'));
end $$;

create or replace function public.ek_my_2fa() returns boolean language sql security definer set search_path = public as $$
  select coalesce((select enabled from public.ek_2fa where id = auth.uid()), false);
$$;

-- turn it on/off: only from a session signed in with an email code in the last 10 minutes
create or replace function public.ek_set_2fa(p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
    where a->>'method' = 'otp' and (a->>'timestamp')::bigint > extract(epoch from now()) - 600) into ok;
  if not ok then raise exception 'Verify with the email code first'; end if;
  insert into public.ek_2fa (id, enabled, updated_at) values (auth.uid(), p_on, now())
    on conflict (id) do update set enabled = excluded.enabled, updated_at = now();
  return p_on;
end $$;

revoke all on function public.ek_login_check(text, text) from public;
revoke all on function public.ek_my_2fa() from public;
revoke all on function public.ek_set_2fa(boolean) from public;
grant execute on function public.ek_login_check(text, text) to anon, authenticated;
grant execute on function public.ek_my_2fa() to authenticated;
grant execute on function public.ek_set_2fa(boolean) to authenticated;
