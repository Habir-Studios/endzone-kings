-- Endzone Kings: likes on clips. Safe to run again.
create table if not exists public.ek_clip_likes (
  clip_id bigint not null references public.ek_clips on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);
alter table public.ek_clip_likes enable row level security;
drop policy if exists "ek_clip_likes read" on public.ek_clip_likes;
create policy "ek_clip_likes read" on public.ek_clip_likes for select using (true);
drop policy if exists "ek_clip_likes add" on public.ek_clip_likes;
create policy "ek_clip_likes add" on public.ek_clip_likes for insert with check (auth.uid() = user_id and not public.ek_banned(auth.uid()));
drop policy if exists "ek_clip_likes remove" on public.ek_clip_likes;
create policy "ek_clip_likes remove" on public.ek_clip_likes for delete using (auth.uid() = user_id);
grant select on public.ek_clip_likes to anon, authenticated;
grant insert, delete on public.ek_clip_likes to authenticated;
create index if not exists ek_clip_likes_clip on public.ek_clip_likes (clip_id, created_at desc);
notify pgrst, 'reload schema';
