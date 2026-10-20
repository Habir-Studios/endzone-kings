-- Endzone Kings: Season 1 record reset (Oct 20, 2026). Wins, losses, ties and games played start over for everyone
-- so leaderboards and profile game history count from the same day. Levels, coins, cards and stat totals stay.
-- A backup of the old numbers is kept in ek_players_backup_20261020.
create table if not exists public.ek_players_backup_20261020 as
  select id, name, games, wins, losses, on_w, on_l, on_t, ut_wins, ut_l, ut_t, ut_games, fr_w, fr_l, fr_t, now() as saved_at from public.ek_players;
alter table public.ek_players_backup_20261020 enable row level security;   -- nobody reads it from the game
update public.ek_players set games = 0, wins = 0, losses = 0, on_w = 0, on_l = 0, on_t = 0, ut_wins = 0, ut_l = 0, ut_t = 0, ut_games = 0, fr_w = 0, fr_l = 0, fr_t = 0;
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"wins":0,"losses":0,"ties":0}'::jsonb;
delete from public.ek_game_log;
select (select count(*) from public.ek_players_backup_20261020) as backed_up, (select coalesce(sum(games + on_w + on_l + ut_wins + fr_w), 0) from public.ek_players) as left_over;
