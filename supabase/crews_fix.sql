drop policy if exists "crew members join" on public.ek_crew_members;
create policy "crew members join" on public.ek_crew_members for insert with check (player = auth.uid() and (select count(*) from public.ek_crew_members m where m.crew = ek_crew_members.crew) < 20);
