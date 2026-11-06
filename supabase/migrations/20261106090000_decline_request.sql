begin;
create or replace function public.decline_shift_request(p_pass_id uuid, p_vikarie_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare shift public.vikariepass;
begin
  if not exists (
    select 1 from public.vikarier v join public.profiler p on p.id = v.profil_id
    where v.id = p_vikarie_id and p.id = auth.uid() and p.aktiv and v.aktiv and p.roll = 'vikarie'
  ) then
    raise exception 'Du saknar behorighet till denna forfragan.' using errcode = '42501';
  end if;
  -- Same lock order as acceptance: serialize competing answers and admin edits.
  select * into shift from public.vikariepass where id = p_pass_id for update;
  if not found or shift.status = 'avbokat' then
    raise exception 'Passet ar inte tillgangligt.';
  end if;
  update public.pass_forfragningar set status = 'nej', svarat_kl = now()
    where pass_id = p_pass_id and vikarie_id = p_vikarie_id and status = 'vantar';
  if not found then
    raise exception 'Forfragan ar inte langre aktiv.';
  end if;
  if shift.vikarie_id is null and shift.status = 'notifierat' and not exists (
    select 1 from public.pass_forfragningar where pass_id = p_pass_id and status = 'vantar'
  ) then
    update public.vikariepass set status = 'obokat', riktad_till_vikarie_id = null where id = p_pass_id;
  end if;
end;
$$;
revoke all on function public.decline_shift_request(uuid, uuid) from public, anon;
grant execute on function public.decline_shift_request(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
