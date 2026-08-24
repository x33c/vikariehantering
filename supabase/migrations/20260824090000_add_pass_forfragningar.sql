create table if not exists public.pass_forfragningar (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.vikariepass(id) on delete cascade,
  vikarie_id uuid not null references public.vikarier(id) on delete cascade,
  status text not null default 'vantar' check (status in ('vantar', 'ja', 'nej', 'aterkallad')),
  svarat_kl timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pass_id, vikarie_id)
);

create index if not exists idx_pass_forfragningar_pass
  on public.pass_forfragningar(pass_id);

create index if not exists idx_pass_forfragningar_vikarie_status
  on public.pass_forfragningar(vikarie_id, status);

drop trigger if exists trg_pass_forfragningar_updated on public.pass_forfragningar;

create trigger trg_pass_forfragningar_updated
  before update on public.pass_forfragningar
  for each row execute function uppdatera_updated_at();

alter table public.pass_forfragningar enable row level security;

drop policy if exists "Admin hanterar passforfragningar" on public.pass_forfragningar;

create policy "Admin hanterar passforfragningar"
  on public.pass_forfragningar
  for all
  using (auth_roll() = 'admin')
  with check (auth_roll() = 'admin');

drop policy if exists "Vikarie ser egna passforfragningar" on public.pass_forfragningar;

create policy "Vikarie ser egna passforfragningar"
  on public.pass_forfragningar
  for select
  using (vikarie_id = auth_vikarie_id());

drop policy if exists "Vikarie svarar pa egna passforfragningar" on public.pass_forfragningar;

create policy "Vikarie svarar pa egna passforfragningar"
  on public.pass_forfragningar
  for update
  using (vikarie_id = auth_vikarie_id())
  with check (vikarie_id = auth_vikarie_id());

notify pgrst, 'reload schema';
