alter table public.notiser
  alter column pass_id drop not null;

create index if not exists idx_notiser_vikarie_created_at
  on public.notiser (vikarie_id, created_at desc);

grant delete on table public.notiser to authenticated;

drop policy if exists "Vikarie raderar sina notiser" on public.notiser;
create policy "Vikarie raderar sina notiser"
  on public.notiser
  for delete
  to authenticated
  using (vikarie_id = (select auth_vikarie_id()));

notify pgrst, 'reload schema';
