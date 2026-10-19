-- Endzone Kings: "remember this device for 10 days" for two-step login. Run once in the SQL editor.
-- After you type an authenticator code with the box ticked, that device gets a secret pass (only its hash is stored).
-- Logging in again on that device presents the pass: the server marks the new session as trusted for the rest of
-- the 10 days, so the 2FA gate (ek_mfa_ok) lets it through without a code. Other devices still need the code.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.ek_trusted_devices (id bigserial primary key, user_id uuid not null references auth.users on delete cascade, token_hash text not null, expires_at timestamptz not null);
create table if not exists public.ek_trusted_sessions (session_id uuid primary key, user_id uuid not null references auth.users on delete cascade, expires_at timestamptz not null);
alter table public.ek_trusted_devices enable row level security;
alter table public.ek_trusted_sessions enable row level security;
revoke all on public.ek_trusted_devices from anon, authenticated;
revoke all on public.ek_trusted_sessions from anon, authenticated;

create or replace function public.ek_mfa_ok() returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
      or exists (select 1 from public.ek_trusted_sessions t where t.user_id = auth.uid() and t.session_id::text = coalesce(auth.jwt()->>'session_id', '') and t.expires_at > now());
$$;

-- tick the box after typing a code: returns the device's secret pass
create or replace function public.ek_trust_device() returns text language plpgsql security definer set search_path = public, extensions, auth as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex'); exp timestamptz := now() + interval '10 days';
begin
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then raise exception 'Type your authenticator code first'; end if;
  delete from public.ek_trusted_devices where user_id = auth.uid() and expires_at < now();
  insert into public.ek_trusted_devices (user_id, token_hash, expires_at) values (auth.uid(), encode(extensions.digest(tok, 'sha256'), 'hex'), exp);
  return tok;
end $$;

-- a remembered device logs in: if its pass is valid, this session counts as verified until the pass expires
create or replace function public.ek_use_trust(p_token text) returns boolean language plpgsql security definer set search_path = public, extensions, auth as $$
declare exp timestamptz; sid text := coalesce(auth.jwt()->>'session_id', '');
begin
  if sid = '' or p_token is null then return false; end if;
  select d.expires_at into exp from public.ek_trusted_devices d
   where d.user_id = auth.uid() and d.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and d.expires_at > now() limit 1;
  if exp is null then return false; end if;
  insert into public.ek_trusted_sessions (session_id, user_id, expires_at) values (sid::uuid, auth.uid(), exp)
    on conflict (session_id) do update set expires_at = excluded.expires_at;
  return true;
end $$;

-- turning 2FA off forgets every remembered device
create or replace function public.ek_forget_devices() returns void language sql security definer set search_path = public as $$
  delete from public.ek_trusted_devices where user_id = auth.uid(); delete from public.ek_trusted_sessions where user_id = auth.uid();
$$;

revoke all on function public.ek_trust_device() from public;
revoke all on function public.ek_use_trust(text) from public;
revoke all on function public.ek_forget_devices() from public;
grant execute on function public.ek_trust_device() to authenticated;
grant execute on function public.ek_use_trust(text) to authenticated;
grant execute on function public.ek_forget_devices() to authenticated;
select count(*) as fns from pg_proc where proname in ('ek_trust_device','ek_use_trust','ek_forget_devices','ek_mfa_ok');
