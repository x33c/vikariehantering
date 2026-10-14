begin;
create or replace function public.snapshot_substitute_withdrawal()
returns trigger language plpgsql set search_path = public as $$
declare
  shift public.vikariepass;
begin
  if new.metadata->>'åtgärd' = 'registrerade_aterbud' then
    select * into shift from public.vikariepass where id = new.pass_id;
    if found then
      new.metadata := new.metadata || jsonb_build_object(
        'datum', shift.datum,
        'tid_från', shift.tid_från,
        'tid_till', shift.tid_till,
        'grupp', to_jsonb(shift)->'grupp'
      );
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists snapshot_substitute_withdrawal on public.passhistorik;
create trigger snapshot_substitute_withdrawal before insert on public.passhistorik
for each row execute function public.snapshot_substitute_withdrawal();
commit;
