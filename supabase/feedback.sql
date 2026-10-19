-- Endzone Kings: bug reports, suggestions and help requests from players to the dev team. Run once in the SQL editor.
create table if not exists public.ek_feedback (
  id bigserial primary key,
  user_id uuid references auth.users on delete set null,
  username text not null default 'Guest' check (char_length(username) <= 24),
  kind text not null check (kind in ('bug', 'idea', 'help')),
  message text not null check (char_length(message) between 3 and 1500),
  device text check (char_length(device) <= 200),
  version text check (char_length(version) <= 20),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists ek_feedback_created on public.ek_feedback (created_at desc);
alter table public.ek_feedback enable row level security;
drop policy if exists "ek_feedback send" on public.ek_feedback;
create policy "ek_feedback send" on public.ek_feedback for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
drop policy if exists "ek_feedback admin read" on public.ek_feedback;
create policy "ek_feedback admin read" on public.ek_feedback for select using (public.ek_is_admin());
drop policy if exists "ek_feedback admin update" on public.ek_feedback;
create policy "ek_feedback admin update" on public.ek_feedback for update using (public.ek_is_admin());
drop policy if exists "ek_feedback admin delete" on public.ek_feedback;
create policy "ek_feedback admin delete" on public.ek_feedback for delete using (public.ek_is_admin());
grant insert on public.ek_feedback to anon, authenticated;
grant select, update, delete on public.ek_feedback to authenticated;
grant usage, select on sequence public.ek_feedback_id_seq to anon, authenticated;
-- no spam: at most 5 messages an hour per account
create or replace function public.ek_feedback_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (select count(*) from public.ek_feedback where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You sent a lot of messages. Try again in a bit.';
  end if;
  return new;
end $$;
drop trigger if exists ek_feedback_limit on public.ek_feedback;
create trigger ek_feedback_limit before insert on public.ek_feedback for each row execute function public.ek_feedback_limit();
select count(*) as ok from information_schema.tables where table_name = 'ek_feedback';
