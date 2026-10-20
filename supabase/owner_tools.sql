-- Endzone Kings: real player count, owner-only account lookup, and (again, safely) the announcements table.
-- Run once in the SQL editor.

-- every real account counts, even ones that never opened their profile
create or replace function public.ek_player_total() returns bigint language sql stable security definer set search_path = public, auth as $$
  select count(*) from auth.users where coalesce(is_anonymous, false) = false;
$$;
revoke all on function public.ek_player_total() from public;
grant execute on function public.ek_player_total() to anon, authenticated;

-- owner only: look up an account by email or username (returns nothing for anyone else)
create or replace function public.ek_owner_lookup(q text)
returns table (id uuid, username text, email text, created_at timestamptz, last_sign_in timestamptz, confirmed boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, coalesce(p.name, u.raw_user_meta_data->>'username'), u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null
    from auth.users u left join public.ek_players p on p.id = u.id
   where auth.uid() = 'e752f854-2dce-4a38-ab93-54bcb963dc14'::uuid
     and length(trim(q)) >= 2
     and (u.email ilike '%' || trim(q) || '%' or p.name ilike '%' || trim(q) || '%' or (u.raw_user_meta_data->>'username') ilike '%' || trim(q) || '%')
   order by u.created_at desc limit 25;
$$;
revoke all on function public.ek_owner_lookup(text) from public;
grant execute on function public.ek_owner_lookup(text) to authenticated;
-- Endzone Kings: global announcements from the owner, shown to everyone with the game open (live) and on next load.
-- Run once in the SQL editor.
create table if not exists public.ek_announcements (
  id bigserial primary key,
  author uuid references auth.users on delete set null,
  name text not null default 'HussainZ2' check (char_length(name) <= 24),
  message text not null check (char_length(message) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists ek_announcements_created on public.ek_announcements (created_at desc);
alter table public.ek_announcements enable row level security;
drop policy if exists "ek_announcements read" on public.ek_announcements;
create policy "ek_announcements read" on public.ek_announcements for select using (true);
drop policy if exists "ek_announcements admin write" on public.ek_announcements;
create policy "ek_announcements admin write" on public.ek_announcements for insert with check (auth.uid() = 'e752f854-2dce-4a38-ab93-54bcb963dc14'::uuid and author = auth.uid());   -- only the owner (HussainZ2) can post
drop policy if exists "ek_announcements admin delete" on public.ek_announcements;
create policy "ek_announcements admin delete" on public.ek_announcements for delete using (auth.uid() = 'e752f854-2dce-4a38-ab93-54bcb963dc14'::uuid);
grant select on public.ek_announcements to anon, authenticated;
grant insert, delete on public.ek_announcements to authenticated;
grant usage, select on sequence public.ek_announcements_id_seq to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ek_announcements') then
    alter publication supabase_realtime add table public.ek_announcements;
  end if;
end $$;

select public.ek_player_total() as players, (select count(*) from information_schema.tables where table_name = 'ek_announcements') as ann_table;
