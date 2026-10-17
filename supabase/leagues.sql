-- Online Franchise: up to 16 people each run a team. Before the season everyone drafts from one player pool
-- (bots fill empty spots and pick for themselves), trades stay open all season, and a 16-team knockout bracket
-- runs until the last two meet in the Kings Bowl. Reads are public; every write goes through these functions.
create table if not exists public.ek_leagues (
  id text primary key,
  name text not null check (char_length(name) between 2 and 24),
  owner uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open',
  season jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.ek_league_members (
  league text not null references public.ek_leagues(id) on delete cascade,
  player uuid not null references auth.users(id) on delete cascade,
  team int not null,
  joined_at timestamptz not null default now(),
  primary key (league, player),
  unique (league, team)
);
alter table public.ek_leagues enable row level security;
alter table public.ek_league_members enable row level security;
drop policy if exists "leagues read" on public.ek_leagues;
drop policy if exists "league members read" on public.ek_league_members;
create policy "leagues read" on public.ek_leagues for select using (true);
create policy "league members read" on public.ek_league_members for select using (true);
grant select on public.ek_leagues, public.ek_league_members to anon, authenticated;

create or replace function public.ek_league_create(lname text, lteam int) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); code text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from ek_league_members where player = uid) >= 5 then raise exception 'You can be in 5 leagues at most'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into ek_leagues (id, name, owner) values (code, left(lname, 24), uid);
  insert into ek_league_members (league, player, team) values (code, uid, lteam);
  return code;
end $$;

create or replace function public.ek_league_join(code text, lteam int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into L from ek_leagues where id = upper(code);
  if L.id is null then raise exception 'No league with that code'; end if;
  if L.status <> 'open' then raise exception 'That league already started'; end if;
  if (select count(*) from ek_league_members where league = L.id) >= 16 then raise exception 'That league is full (16)'; end if;
  if exists (select 1 from ek_league_members where league = L.id and team = lteam and player <> uid) then raise exception 'Someone already has that team'; end if;
  insert into ek_league_members (league, player, team) values (L.id, uid, lteam) on conflict (league, player) do update set team = excluded.team;
end $$;

create or replace function public.ek_league_leave(code text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues;
begin
  select * into L from ek_leagues where id = upper(code);
  if L.id is null then return; end if;
  if L.owner = uid then delete from ek_leagues where id = L.id; return; end if;   -- the commissioner leaving closes the league
  if L.status <> 'open' then raise exception 'You can''t leave once the draft has started'; end if;
  delete from ek_league_members where league = L.id and player = uid;
end $$;

-- commissioner starts the draft: the client builds the 16 slots (members + bots) and the shared player pool
create or replace function public.ek_league_start(code text, s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues;
begin
  select * into L from ek_leagues where id = upper(code) for update;
  if L.id is null or L.owner <> uid then raise exception 'Only the commissioner can start the draft'; end if;
  if L.status <> 'open' then raise exception 'Already started'; end if;
  if jsonb_array_length(s->'slots') <> 16 then raise exception 'Need 16 slots'; end if;
  update ek_leagues set status = 'draft', season = s || jsonb_build_object('phase', 'draft', 'pick', 0, 'picks', '[]'::jsonb, 'trades', '[]'::jsonb, 'dl', extract(epoch from now()) + 60) where id = L.id;
end $$;

-- simple sim score for games nobody played (bots, or the commissioner forcing a stuck game)
create or replace function public.ek_lg_strength(s jsonb, slot int) returns numeric
language sql immutable as $$
  select coalesce(sum((p->>'o')::numeric), 0) from jsonb_array_elements(s->'picks') p where (p->>'s')::int = slot
$$;
create or replace function public.ek_lg_sim(s jsonb, g jsonb) returns jsonb
language plpgsql as $$
declare d numeric := (ek_lg_strength(s, (g->>'h')::int) - ek_lg_strength(s, (g->>'a')::int)) / 40.0; hs int; aws int;
begin
  hs := round(10 + random() * 24 + d); aws := round(10 + random() * 24 - d);
  if hs = aws then hs := hs + 3; end if;
  return g || jsonb_build_object('hs', greatest(hs, 0), 'as', greatest(aws, 0), 'sim', true);
end $$;

-- after a round is fully played: winners pair up for the next round; one game left = the Kings Bowl; then a champion
create or replace function public.ek_lg_advance(s jsonb) returns jsonb
language plpgsql as $$
declare r int; games jsonb; nxt jsonb := '[]'::jsonb; i int; n int; w1 int; w2 int; g jsonb;
begin
  loop
    r := (s->>'r')::int; games := s->'br'->r;
    -- bot vs bot games play themselves
    for i in 0 .. jsonb_array_length(games) - 1 loop
      g := games->i;
      if (g->>'hs') is null and (s->'slots'->((g->>'h')::int)->>'u') is null and (s->'slots'->((g->>'a')::int)->>'u') is null then
        s := jsonb_set(s, array['br', r::text, i::text], ek_lg_sim(s, g)); end if;
    end loop;
    games := s->'br'->r;
    if exists (select 1 from jsonb_array_elements(games) e where e->>'hs' is null) then return s; end if;
    n := jsonb_array_length(games);
    if n = 1 then
      g := games->0;
      return s || jsonb_build_object('phase', 'done', 'champ', case when (g->>'hs')::int >= (g->>'as')::int then (g->>'h')::int else (g->>'a')::int end);
    end if;
    nxt := '[]'::jsonb; i := 0;
    while i < n loop
      g := games->i; w1 := case when (g->>'hs')::int >= (g->>'as')::int then (g->>'h')::int else (g->>'a')::int end;
      g := games->(i + 1); w2 := case when (g->>'hs')::int >= (g->>'as')::int then (g->>'h')::int else (g->>'a')::int end;
      nxt := nxt || jsonb_build_array(jsonb_build_object('h', w1, 'a', w2));
      i := i + 2;
    end loop;
    s := jsonb_set(s, '{br}', (s->'br') || jsonb_build_array(nxt));
    s := jsonb_set(s, '{r}', to_jsonb(r + 1));
  end loop;
end $$;

-- one draft pick. Your own pick when you're on the clock, or (anyone can trigger) a bot's pick / an auto-pick when the clock runs out
create or replace function public.ek_draft_pick(code text, cid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues; s jsonb; p int; total int; rnd int; idx int; su text; mine boolean; ovr int; grp text; pick jsonb; i int; br jsonb := '[]'::jsonb;
begin
  select * into L from ek_leagues where id = upper(code) for update;
  if L.id is null or L.season is null then raise exception 'No draft'; end if;
  if not exists (select 1 from ek_league_members where league = L.id and player = uid) then raise exception 'You are not in this league'; end if;
  s := L.season;
  if s->>'phase' <> 'draft' then return; end if;
  p := (s->>'pick')::int; total := 16 * (s->>'rounds')::int;
  if p >= total then return; end if;
  rnd := p / 16; idx := case when rnd % 2 = 0 then p % 16 else 15 - (p % 16) end;   -- snake order
  su := s->'slots'->idx->>'u'; mine := su is not null and su::uuid = uid;
  if not mine and su is not null and extract(epoch from now()) < (s->>'dl')::numeric then raise exception 'Not your pick yet'; end if;
  if mine and cid is not null then
    select (e->>'o')::int, e->>'g' into ovr, grp from jsonb_array_elements(s->'pool') e where (e->>'c')::bigint = cid;
    if ovr is null then raise exception 'That player isn''t in the pool'; end if;
    if exists (select 1 from jsonb_array_elements(s->'picks') k where (k->>'c')::bigint = cid) then raise exception 'Already drafted'; end if;
  else
    -- best available, preferring positions this team hasn't filled yet
    select (e->>'c')::bigint, (e->>'o')::int, e->>'g' into cid, ovr, grp
    from jsonb_array_elements(s->'pool') with ordinality as t(e, ord)
    where not exists (select 1 from jsonb_array_elements(s->'picks') k where k->>'c' = e->>'c')
    order by (select count(*) from jsonb_array_elements(s->'picks') k where (k->>'s')::int = idx and k->>'g' = e->>'g'), ord limit 1;
  end if;
  pick := jsonb_build_object('s', idx, 'c', cid, 'o', ovr, 'g', grp, 'n', p);
  s := jsonb_set(s, '{picks}', (s->'picks') || jsonb_build_array(pick));
  s := jsonb_set(s, '{pick}', to_jsonb(p + 1));
  s := jsonb_set(s, '{dl}', to_jsonb(extract(epoch from now()) + 60));
  if p + 1 >= total then
    for i in 0 .. 7 loop br := br || jsonb_build_array(jsonb_build_object('h', i, 'a', 15 - i)); end loop;   -- seed 1 vs 16, 2 vs 15, ...
    s := s || jsonb_build_object('phase', 'bracket', 'r', 0, 'br', jsonb_build_array(br));
    s := ek_lg_advance(s);
    update ek_leagues set season = s, status = case when s->>'phase' = 'done' then 'done' else 'season' end where id = L.id;
  else
    update ek_leagues set season = s where id = L.id;
  end if;
end $$;

-- a finished bracket game, reported by one of the two players in it (only once)
create or replace function public.ek_lg_report(code text, rr int, gi int, hs int, aws int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues; s jsonb; g jsonb; hu text; au text;
begin
  select * into L from ek_leagues where id = upper(code) for update;
  if L.id is null or L.season is null then raise exception 'No season'; end if;
  s := L.season; if s->>'phase' <> 'bracket' or (s->>'r')::int <> rr then raise exception 'That round is over'; end if;
  g := s->'br'->rr->gi; if g is null then raise exception 'No such game'; end if;
  if (g->>'hs') is not null then return; end if;
  hu := s->'slots'->((g->>'h')::int)->>'u'; au := s->'slots'->((g->>'a')::int)->>'u';
  if coalesce(hu, '') <> uid::text and coalesce(au, '') <> uid::text then raise exception 'You are not in that game'; end if;
  if hs = aws then hs := hs + 1; end if;   -- knockout: no ties
  s := jsonb_set(s, array['br', rr::text, gi::text], g || jsonb_build_object('hs', least(greatest(hs, 0), 150), 'as', least(greatest(aws, 0), 150)));
  s := ek_lg_advance(s);
  update ek_leagues set season = s, status = case when s->>'phase' = 'done' then 'done' else 'season' end where id = L.id;
end $$;

-- the commissioner can sim a game that's stuck (somebody never showed up)
create or replace function public.ek_lg_force(code text, gi int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues; s jsonb; r int; g jsonb;
begin
  select * into L from ek_leagues where id = upper(code) for update;
  if L.id is null or L.owner <> uid then raise exception 'Only the commissioner can do that'; end if;
  s := L.season; if s->>'phase' <> 'bracket' then return; end if;
  r := (s->>'r')::int; g := s->'br'->r->gi; if g is null or (g->>'hs') is not null then return; end if;
  s := jsonb_set(s, array['br', r::text, gi::text], ek_lg_sim(s, g));
  s := ek_lg_advance(s);
  update ek_leagues set season = s, status = case when s->>'phase' = 'done' then 'done' else 'season' end where id = L.id;
end $$;

-- trades: swap drafted players between two teams. Bots take any deal that's fair or better for them.
create or replace function public.ek_lg_swap(s jsonb, f int, t int, give jsonb, gett jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(s, '{picks}', coalesce((select jsonb_agg(case when give ? (k->>'c') then jsonb_set(k, '{s}', to_jsonb(t)) when gett ? (k->>'c') then jsonb_set(k, '{s}', to_jsonb(f)) else k end) from jsonb_array_elements(s->'picks') k), '[]'::jsonb))
$$;
create or replace function public.ek_lg_trade(code text, tslot int, give jsonb, gett jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues; s jsonb; f int; gv numeric; tv numeric; c text; tid text;
begin
  select * into L from ek_leagues where id = upper(code) for update;
  if L.id is null or L.season is null then raise exception 'No season'; end if;
  s := L.season; if s->>'phase' not in ('bracket') then raise exception 'Trades open once the draft is done'; end if;
  select (i - 1)::int into f from jsonb_array_elements(s->'slots') with ordinality as t(e, i) where e->>'u' = uid::text;
  if f is null then raise exception 'You are not in this league'; end if;
  if tslot = f or tslot < 0 or tslot > 15 then raise exception 'Pick another team'; end if;
  if jsonb_array_length(give) = 0 or jsonb_array_length(gett) = 0 or jsonb_array_length(give) > 3 or jsonb_array_length(gett) > 3 then raise exception 'Trade 1 to 3 players each way'; end if;
  for c in select jsonb_array_elements_text(give) loop if not exists (select 1 from jsonb_array_elements(s->'picks') k where k->>'c' = c and (k->>'s')::int = f) then raise exception 'You don''t have one of those players'; end if; end loop;
  for c in select jsonb_array_elements_text(gett) loop if not exists (select 1 from jsonb_array_elements(s->'picks') k where k->>'c' = c and (k->>'s')::int = tslot) then raise exception 'They don''t have one of those players'; end if; end loop;
  if (s->'slots'->tslot->>'u') is null then
    select coalesce(sum((k->>'o')::numeric), 0) into gv from jsonb_array_elements(s->'picks') k where give ? (k->>'c');
    select coalesce(sum((k->>'o')::numeric), 0) into tv from jsonb_array_elements(s->'picks') k where gett ? (k->>'c');
    if gv < tv + 1 then return 'declined'; end if;   -- the bot wants a little more than it gives
    s := ek_lg_swap(s, f, tslot, give, gett);
    s := jsonb_set(s, '{trades}', (s->'trades') || jsonb_build_array(jsonb_build_object('id', md5(random()::text), 'f', f, 't', tslot, 'give', give, 'get', gett, 'st', 'done')));
    update ek_leagues set season = s where id = L.id; return 'accepted';
  end if;
  tid := substr(md5(random()::text), 1, 8);
  s := jsonb_set(s, '{trades}', (s->'trades') || jsonb_build_array(jsonb_build_object('id', tid, 'f', f, 't', tslot, 'give', give, 'get', gett, 'st', 'open')));
  update ek_leagues set season = s where id = L.id; return 'sent';
end $$;
create or replace function public.ek_lg_trade_answer(code text, tid text, yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); L ek_leagues; s jsonb; tr jsonb; i int; c text; ok boolean := true;
begin
  select * into L from ek_leagues where id = upper(code) for update;
  s := L.season;
  select e, (ord - 1)::int into tr, i from jsonb_array_elements(s->'trades') with ordinality as t(e, ord) where e->>'id' = tid;
  if tr is null or tr->>'st' <> 'open' then raise exception 'That trade is gone'; end if;
  if (s->'slots'->((tr->>'t')::int)->>'u') <> uid::text and (s->'slots'->((tr->>'f')::int)->>'u') <> uid::text then raise exception 'Not your trade'; end if;
  if yes and (s->'slots'->((tr->>'t')::int)->>'u') <> uid::text then raise exception 'Only the other team can accept'; end if;
  if yes then
    for c in select jsonb_array_elements_text(tr->'give') loop if not exists (select 1 from jsonb_array_elements(s->'picks') k where k->>'c' = c and (k->>'s')::int = (tr->>'f')::int) then ok := false; end if; end loop;
    for c in select jsonb_array_elements_text(tr->'get') loop if not exists (select 1 from jsonb_array_elements(s->'picks') k where k->>'c' = c and (k->>'s')::int = (tr->>'t')::int) then ok := false; end if; end loop;
    if ok then s := ek_lg_swap(s, (tr->>'f')::int, (tr->>'t')::int, tr->'give', tr->'get'); end if;
  end if;
  s := jsonb_set(s, array['trades', i::text, 'st'], to_jsonb(case when yes and ok then 'done' when yes then 'void' else 'no' end));
  update ek_leagues set season = s where id = L.id;
end $$;

revoke all on function public.ek_league_create(text, int), public.ek_league_join(text, int), public.ek_league_leave(text), public.ek_league_start(text, jsonb), public.ek_draft_pick(text, bigint), public.ek_lg_report(text, int, int, int, int), public.ek_lg_force(text, int), public.ek_lg_trade(text, int, jsonb, jsonb), public.ek_lg_trade_answer(text, text, boolean) from public, anon;
grant execute on function public.ek_league_create(text, int), public.ek_league_join(text, int), public.ek_league_leave(text), public.ek_league_start(text, jsonb), public.ek_draft_pick(text, bigint), public.ek_lg_report(text, int, int, int, int), public.ek_lg_force(text, int), public.ek_lg_trade(text, int, jsonb, jsonb), public.ek_lg_trade_answer(text, text, boolean) to authenticated;
