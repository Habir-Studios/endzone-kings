-- Endzone Kings: remember who you were playing in a clip. Safe to run again.
alter table public.ek_clips add column if not exists vs text not null default '' check (char_length(vs) <= 20);
notify pgrst, 'reload schema';
