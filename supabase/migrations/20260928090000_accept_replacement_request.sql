begin;

create or replace function public.accept_shift_request(p_pass_id uuid, p_vikarie_id uuid)
returns public.vikariepass
language plpgsql security definer set search_path = public
as $$
declare
  shift public.vikariepass;
  previous_sub uuid;
begin
  if not exists (
    select 1 from public.vikarier v join public.profiler p on p.id = v.profil_id
    where v.id = p_vikarie_id and p.id = auth.uid() and p.aktiv and v.aktiv
      and p.roll = 'vikarie'
  ) then
    raise exception 'Du saknar behorighet till denna forfragan.' using errcode = '42501';
  end if;
  select * into shift from public.vikariepass where id = p_pass_id for update;
  if not found or shift.status = 'avbokat' then
    raise exception 'Passet ar inte tillgangligt.' using errcode = 'P0001';
  end if;
  perform 1 from public.pass_forfragningar
    where pass_id = p_pass_id and vikarie_id = p_vikarie_id and status = 'vantar' for update;
  if not found then
    raise exception 'Forfragan ar inte langre aktiv.' using errcode = 'P0001';
  end if;
  previous_sub := shift.vikarie_id;
  -- Existing overlap protection runs on this update. Any failure rolls back everything.
  update public.vikariepass set vikarie_id = p_vikarie_id, status = 'bokat',
    riktad_till_vikarie_id = null, publicerad = false
    where id = p_pass_id returning * into shift;
  update public.pass_forfragningar set
    status = case when vikarie_id = p_vikarie_id then 'ja' else 'aterkallad' end,
    svarat_kl = now()
    where pass_id = p_pass_id and status = 'vantar';
  if previous_sub is not null and previous_sub <> p_vikarie_id then
    insert into public.notiser(pass_id, vikarie_id, mottagare, kanal, status, ämne, innehåll, skickat_kl)
    values(p_pass_id, previous_sub, 'vikarie', 'push', 'skickat', 'Din bokning har ersatts',
      'Du är inte längre bokad på passet ' || shift.datum::text || ' ' ||
      to_char(shift.tid_från, 'HH24:MI') || '-' || to_char(shift.tid_till, 'HH24:MI') ||
      '. En annan vikarie har tackat ja till administratörens förfrågan.', now());
  end if;
  return shift;
end;
$$;
revoke all on function public.accept_shift_request(uuid, uuid) from public, anon;
grant execute on function public.accept_shift_request(uuid, uuid) to authenticated;

drop policy if exists "Vikarie ser erbjudet bokat pass" on public.vikariepass;
create policy "Vikarie ser erbjudet bokat pass" on public.vikariepass for select
  to authenticated using (exists (
    select 1 from public.pass_forfragningar f join public.vikarier v on v.id = f.vikarie_id
    where f.pass_id = vikariepass.id and f.status = 'vantar' and v.profil_id = auth.uid() and v.aktiv
  ));

-- A booked shift remains booked when an administrator sends additional requests.
create or replace function public.protect_request_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  -- The transaction owner and service role may close all competing requests.
  if current_user = 'authenticated' and not exists (
    select 1 from public.profiler where id = auth.uid() and roll = 'admin' and aktiv
  ) then
    if new.pass_id is distinct from old.pass_id or new.vikarie_id is distinct from old.vikarie_id
       or old.status <> 'vantar' or new.status not in ('ja', 'nej') then
      raise exception 'Forfragan far inte flyttas eller ateroppnas.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_request_identity on public.pass_forfragningar;
create trigger protect_request_identity before update on public.pass_forfragningar
  for each row execute function public.protect_request_identity();

create or replace function public.keep_booking_on_request()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'notifierat' and old.vikarie_id is not null
     and new.vikarie_id = old.vikarie_id and old.status in ('bokat', 'bekräftat') then
    new.status := old.status;
  end if;
  return new;
end;
$$;
drop trigger if exists keep_booking_on_request on public.vikariepass;
create trigger keep_booking_on_request before update on public.vikariepass
  for each row execute function public.keep_booking_on_request();
notify pgrst, 'reload schema';
commit;
