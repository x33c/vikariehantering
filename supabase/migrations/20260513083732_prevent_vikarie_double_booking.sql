create or replace function public.stoppa_dubbelbokad_vikarie()
returns trigger
language plpgsql
as $$
begin
  if new.vikarie_id is null then
    return new;
  end if;

  if new.status not in ('bokat', 'bekräftat') then
    return new;
  end if;

  if exists (
    select 1
    from public.vikariepass p
    where p.id <> new.id
      and p.vikarie_id = new.vikarie_id
      and p.datum = new.datum
      and p.status in ('bokat', 'bekräftat')
      and new."tid_från" < p."tid_till"
      and new."tid_till" > p."tid_från"
  ) then
    raise exception 'Vikarien är redan bokad på ett pass som överlappar denna tid.';
  end if;

  return new;
end;
$$;

drop trigger if exists stoppa_dubbelbokad_vikarie_trigger on public.vikariepass;

create trigger stoppa_dubbelbokad_vikarie_trigger
before insert or update of vikarie_id, status, "tid_från", "tid_till", datum
on public.vikariepass
for each row
execute function public.stoppa_dubbelbokad_vikarie();
