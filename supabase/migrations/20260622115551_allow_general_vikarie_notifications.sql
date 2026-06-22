alter table public.notiser
  alter column pass_id drop not null;

create index if not exists idx_notiser_vikarie_created_at
  on public.notiser (vikarie_id, created_at desc);

notify pgrst, 'reload schema';
