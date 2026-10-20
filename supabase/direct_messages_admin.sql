-- Endzone Kings: admin/owner messages sent to specific players (5-second pop-up for just them), on top of owner-only
-- global messages. targets = null means everyone (owner only); otherwise only those players see it.
alter table public.ek_announcements add column if not exists targets uuid[];
drop policy if exists "ek_announcements read" on public.ek_announcements;
create policy "ek_announcements read" on public.ek_announcements for select
  using (targets is null or auth.uid() = any(targets) or public.ek_is_admin());
drop policy if exists "ek_announcements admin write" on public.ek_announcements;
create policy "ek_announcements admin write" on public.ek_announcements for insert with check (
  author = auth.uid() and (
    auth.uid() = 'e752f854-2dce-4a38-ab93-54bcb963dc14'::uuid                                   -- the owner: everyone or anyone
    or (public.ek_is_admin() and targets is not null and cardinality(targets) between 1 and 50)  -- admins: specific players only
  ));
select count(*) as targets_col from information_schema.columns where table_name = 'ek_announcements' and column_name = 'targets';
