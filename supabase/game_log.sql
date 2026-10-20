-- Endzone Kings: every finished game (any mode) for the game history on player profiles. Run once in the SQL editor.
create table if not exists public.ek_game_log (
  id bigserial primary key,
  player uuid not null references auth.users on delete cascade,
  mode text not null check (char_length(mode) <= 24),
  res text not null check (res in ('W', 'L', 'T')),
  sc_me int not null default 0, sc_opp int not null default 0,
  vs text check (char_length(vs) <= 30),
  created_at timestamptz not null default now()
);
create index if not exists ek_game_log_player on public.ek_game_log (player, created_at desc);
alter table public.ek_game_log enable row level security;
drop policy if exists "ek_game_log read" on public.ek_game_log;
create policy "ek_game_log read" on public.ek_game_log for select using (true);
drop policy if exists "ek_game_log insert own" on public.ek_game_log;
create policy "ek_game_log insert own" on public.ek_game_log for insert with check (player = auth.uid() and not public.ek_banned(auth.uid()));
grant select on public.ek_game_log to anon, authenticated;
grant insert on public.ek_game_log to authenticated;
grant usage, select on sequence public.ek_game_log_id_seq to authenticated;
-- no spam: 60 games an hour per player at most
create or replace function public.ek_game_log_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ek_game_log where player = new.player and created_at > now() - interval '1 hour') >= 60 then raise exception 'Too many games logged'; end if;
  return new;
end $$;
drop trigger if exists ek_game_log_limit on public.ek_game_log;
create trigger ek_game_log_limit before insert on public.ek_game_log for each row execute function public.ek_game_log_limit();
select count(*) as game_log from information_schema.tables where table_name = 'ek_game_log';
