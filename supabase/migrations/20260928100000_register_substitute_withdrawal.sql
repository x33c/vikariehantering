begin;
create or replace function public.register_substitute_withdrawal(p_pass_id uuid, p_vikarie_id uuid)
returns public.vikariepass
language plpgsql security definer set search_path = public
as $$
declare
  shift public.vikariepass;
begin
  if not exists (select 1 from public.profiler where id = auth.uid() and roll = 'admin' and aktiv) then
    raise exception 'Endast administratörer kan registrera återbud.' using errcode = '42501';
  end if;
  select * into shift from public.vikariepass where id = p_pass_id for update;
  if not found or shift.status = 'avbokat' or p_vikarie_id is null
     or shift.vikarie_id is distinct from p_vikarie_id then
    raise exception 'Bokningen har ändrats. Ladda om passet innan du registrerar återbud.' using errcode = 'P0001';
  end if;
  update public.vikariepass set vikarie_id = null, status = 'obokat',
    publicerad = false, riktad_till_vikarie_id = null
    where id = p_pass_id returning * into shift;
  update public.pass_forfragningar set status = 'aterkallad', svarat_kl = now()
    where pass_id = p_pass_id and status = 'vantar';
  insert into public.passhistorik(pass_id, händelse, utförd_av, metadata, anteckning)
    values (p_pass_id, 'vikarie_borttagen', auth.uid(),
      jsonb_build_object('åtgärd', 'registrerade_aterbud', 'vikarie_id', p_vikarie_id),
      'Återbud registrerat. Bokningen borttagen; passet behöver en ersättare.');
  insert into public.notiser(pass_id, vikarie_id, mottagare, kanal, status, ämne, innehåll, skickat_kl)
    values (p_pass_id, p_vikarie_id, 'vikarie', 'push', 'skickat', 'Ditt återbud är registrerat',
      'Admin har registrerat ditt återbud. Du är inte längre bokad ' || shift.datum::text || ' ' ||
      to_char(shift.tid_från, 'HH24:MI') || '-' || to_char(shift.tid_till, 'HH24:MI') || '.', now());
  return shift;
end;
$$;
revoke all on function public.register_substitute_withdrawal(uuid, uuid) from public, anon;
grant execute on function public.register_substitute_withdrawal(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
