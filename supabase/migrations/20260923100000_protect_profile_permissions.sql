begin;

-- RLS limits rows, not columns. Keep self-service profile edits, but protect permissions.
create or replace function public.protect_profile_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.id is distinct from old.id or new.roll is distinct from old.roll or new.aktiv is distinct from old.aktiv)
     and auth.uid() is not null
     and not exists (
       select 1 from public.profiler p
       where p.id = auth.uid() and p.roll = 'admin' and p.aktiv = true
     ) then
    raise exception 'Only administrators may change profile permissions' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_profile_permissions() from public;
drop trigger if exists protect_profile_permissions on public.profiler;
create trigger protect_profile_permissions
before update on public.profiler
for each row execute function public.protect_profile_permissions();

commit;
