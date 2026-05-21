create table if not exists public.utskick_ovrigt (
  datum date primary key,
  text text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.utskick_ovrigt enable row level security;

grant select, insert, update, delete on public.utskick_ovrigt to authenticated;

drop policy if exists "Admin hanterar utskick_ovrigt" on public.utskick_ovrigt;
create policy "Admin hanterar utskick_ovrigt"
on public.utskick_ovrigt
for all
to authenticated
using (
  exists (
    select 1 from public.profiler
    where profiler.id = auth.uid()
      and profiler.roll = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiler
    where profiler.id = auth.uid()
      and profiler.roll = 'admin'
  )
);

create or replace function public.set_utskick_ovrigt_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_utskick_ovrigt_updated_at on public.utskick_ovrigt;
create trigger trg_utskick_ovrigt_updated_at
before insert or update on public.utskick_ovrigt
for each row
execute function public.set_utskick_ovrigt_updated_at();

notify pgrst, 'reload schema';
