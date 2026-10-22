-- Endzone Kings: profile pictures. Run once in the SQL editor.
-- t<team> = a team logo, f<seed>-<team> = a player face in that team's colors.
alter table public.ek_players add column if not exists avatar text;
alter table public.ek_players drop constraint if exists ek_players_avatar_ok;
alter table public.ek_players add constraint ek_players_avatar_ok check (avatar is null or avatar ~ '^(t[0-9]{1,2}|f[0-9]{1,9}-[0-9]{1,2})$');
grant update (avatar) on public.ek_players to authenticated;
select count(*) as ok from information_schema.columns where table_name = 'ek_players' and column_name = 'avatar';
