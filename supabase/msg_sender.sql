-- Endzone Kings: the owner can send messages under any name (and hide the badge); admins always send as themselves.
alter table public.ek_announcements add column if not exists show_badge boolean not null default true;
drop policy if exists "ek_announcements admin write" on public.ek_announcements;
create policy "ek_announcements admin write" on public.ek_announcements for insert with check (
  author = auth.uid() and (
    auth.uid() = 'e752f854-2dce-4a38-ab93-54bcb963dc14'::uuid
    or (public.ek_is_admin() and targets is not null and cardinality(targets) between 1 and 50
        and show_badge and name = (select p.name from public.ek_players p where p.id = auth.uid()))
  ));
select count(*) as badge_col from information_schema.columns where table_name = 'ek_announcements' and column_name = 'show_badge';
