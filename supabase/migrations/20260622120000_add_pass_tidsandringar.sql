create table if not exists public.pass_tidsandringar (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.vikariepass(id) on delete cascade,
  vikarie_id uuid not null references public.vikarier(id) on delete cascade,
  foreslagen_tid_fran time not null,
  foreslagen_tid_till time not null,
  anledning text not null default '',
  status text not null default 'vantar'
    check (status in ('vantar', 'godkand', 'avslagen')),
  beslutad_av uuid references public.profiler(id) on delete set null,
  beslutad_kl timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pass_tidsandringar_giltig_tid
    check (foreslagen_tid_fran < foreslagen_tid_till)
);

create unique index if not exists idx_pass_tidsandringar_aktivt_forslag
  on public.pass_tidsandringar(pass_id, vikarie_id)
  where status = 'vantar';

create index if not exists idx_pass_tidsandringar_pass
  on public.pass_tidsandringar(pass_id, created_at desc);

alter table public.pass_tidsandringar enable row level security;

drop policy if exists "Admin hanterar tidsandringar" on public.pass_tidsandringar;
create policy "Admin hanterar tidsandringar"
  on public.pass_tidsandringar
  for all
  to authenticated
  using (public.auth_roll() = 'admin')
  with check (public.auth_roll() = 'admin');

drop policy if exists "Vikarie ser sina tidsandringar" on public.pass_tidsandringar;
create policy "Vikarie ser sina tidsandringar"
  on public.pass_tidsandringar
  for select
  to authenticated
  using (vikarie_id = public.auth_vikarie_id());

drop policy if exists "Vikarie skapar tidsandring for eget pass" on public.pass_tidsandringar;
create policy "Vikarie skapar tidsandring for eget pass"
  on public.pass_tidsandringar
  for insert
  to authenticated
  with check (
    vikarie_id = public.auth_vikarie_id()
    and exists (
      select 1
      from public.vikariepass p
      where p.id = pass_id
        and p.vikarie_id = public.auth_vikarie_id()
        and p.status in ('bokat', 'bekräftat')
    )
  );

drop policy if exists "Vikarie uppdaterar vantande tidsandring" on public.pass_tidsandringar;
create policy "Vikarie uppdaterar vantande tidsandring"
  on public.pass_tidsandringar
  for update
  to authenticated
  using (
    vikarie_id = public.auth_vikarie_id()
    and status = 'vantar'
  )
  with check (
    vikarie_id = public.auth_vikarie_id()
    and status = 'vantar'
    and beslutad_av is null
    and beslutad_kl is null
    and exists (
      select 1
      from public.vikariepass p
      where p.id = pass_id
        and p.vikarie_id = public.auth_vikarie_id()
        and p.status in ('bokat', 'bekräftat')
    )
  );

grant select, insert, update on public.pass_tidsandringar to authenticated;

alter table public.pass_tidsandringar replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.pass_tidsandringar;
  exception when duplicate_object then
    null;
  end;
end $$;
