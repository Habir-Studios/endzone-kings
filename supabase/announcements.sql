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
select count(*) as ok from information_schema.tables where table_name = 'ek_announcements';
