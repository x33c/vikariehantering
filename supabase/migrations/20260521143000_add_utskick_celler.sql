create table if not exists public.utskick_celler (
  datum date not null,
  typ text not null check (typ in ('franvaro', 'vikarie', 'ovrigt')),
  text text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (datum, typ)
);

alter table public.utskick_celler enable row level security;

grant select, insert, update, delete on public.utskick_celler to authenticated;

drop policy if exists "Admin hanterar utskick_celler" on public.utskick_celler;
create policy "Admin hanterar utskick_celler"
on public.utskick_celler
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

create or replace function public.set_utskick_celler_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_utskick_celler_updated_at on public.utskick_celler;
create trigger trg_utskick_celler_updated_at
before insert or update on public.utskick_celler
for each row
execute function public.set_utskick_celler_updated_at();

notify pgrst, 'reload schema';
