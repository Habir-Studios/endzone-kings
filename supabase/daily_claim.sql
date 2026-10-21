-- Endzone Kings: the daily reward can only be claimed once per day per account, even across devices.
-- Run once in the SQL editor.
alter table public.ek_players add column if not exists daily_day text;
create or replace function public.ek_claim_daily(p_day text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or coalesce(p_day, '') = '' then return false; end if;
  update public.ek_players set daily_day = left(p_day, 12) where id = auth.uid() and daily_day is distinct from left(p_day, 12);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.ek_claim_daily(text) from public, anon;
grant execute on function public.ek_claim_daily(text) to authenticated;
select count(*) as ok from information_schema.columns where table_name = 'ek_players' and column_name = 'daily_day';
