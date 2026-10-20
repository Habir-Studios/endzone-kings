-- Endzone Kings: Season 1 FULL reset, second pass (Oct 20, 2026). Accounts, usernames, passwords, 2-step login, friends, messages,
-- crews and clips stay. All progress goes back to brand new. Everything wiped is backed up in ek_bk_*_20261020b tables.
create table if not exists public.ek_bk_saves_20261020b as select * from public.ek_saves;
create table if not exists public.ek_bk_players_20261020b as select * from public.ek_players;
create table if not exists public.ek_bk_clubs_20261020b as select * from public.ek_clubs;
create table if not exists public.ek_bk_trades_20261020b as select * from public.ek_trades;
create table if not exists public.ek_bk_leagues_20261020b as select * from public.ek_leagues;
create table if not exists public.ek_bk_league_members_20261020b as select * from public.ek_league_members;
alter table public.ek_bk_saves_20261020b enable row level security; alter table public.ek_bk_players_20261020b enable row level security;
alter table public.ek_bk_clubs_20261020b enable row level security; alter table public.ek_bk_trades_20261020b enable row level security;
alter table public.ek_bk_leagues_20261020b enable row level security; alter table public.ek_bk_league_members_20261020b enable row level security;
delete from public.ek_saves;
delete from public.ek_trades;
delete from public.ek_clubs;
delete from public.ek_leagues;            -- league members go with them
delete from public.ek_game_log;
-- every number on the public player row back to zero (level 1); name, team and bio stay
do $$ declare c record; begin
  for c in select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'ek_players' and data_type in ('integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision') and column_name not in ('team')
  loop execute format('update public.ek_players set %I = 0', c.column_name); end loop;
end $$;
update public.ek_players set lvl = 1;
-- the old save copy kept in account metadata, and the old record numbers
update auth.users set raw_user_meta_data = (coalesce(raw_user_meta_data, '{}'::jsonb) - 'ek') || '{"wins":0,"losses":0,"ties":0}'::jsonb;
select (select count(*) from public.ek_bk_saves_20261020b) as saves_backed_up, (select count(*) from public.ek_saves) as saves_left,
       (select max(lvl) from public.ek_players) as max_level, (select count(*) from public.ek_leagues) as leagues_left;
