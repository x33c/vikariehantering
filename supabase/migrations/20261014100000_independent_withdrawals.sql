begin;
-- No foreign key to shifts/history: absence must survive their deletion.
create table if not exists public.vikarie_aterbud (
  id uuid primary key,
  pass_id uuid not null,
  datum date not null,
  metadata jsonb not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid
);
create index if not exists vikarie_aterbud_datum on public.vikarie_aterbud(datum);
alter table public.vikarie_aterbud enable row level security;
revoke all on public.vikarie_aterbud from anon, authenticated;
grant select on public.vikarie_aterbud to authenticated;
drop policy if exists admin_read_withdrawals on public.vikarie_aterbud;
create policy admin_read_withdrawals on public.vikarie_aterbud for select to authenticated
using (exists (select 1 from public.profiler where id = auth.uid() and roll = 'admin' and aktiv));

insert into public.vikarie_aterbud(id, pass_id, datum, metadata, created_at)
select h.id, h.pass_id, coalesce((h.metadata->>'datum')::date, p.datum),
  jsonb_build_object('datum', p.datum, 'tid_från', p.tid_från, 'tid_till', p.tid_till,
    'grupp', to_jsonb(p)->'grupp') || h.metadata, h.created_at
from public.passhistorik h join public.vikariepass p on p.id = h.pass_id
where h.metadata->>'åtgärd' = 'registrerade_aterbud'
on conflict (id) do nothing;

update public.vikarie_aterbud a set hidden_at = h.created_at, hidden_by = h.utförd_av
from public.passhistorik h
where h.metadata->>'åtgärd' = 'dolde_aterbud_i_utskick'
  and h.metadata->'återbud_ids' ? a.id::text and a.hidden_at is null;

create or replace function public.persist_substitute_withdrawal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiler where id = auth.uid() and roll = 'admin' and aktiv) then
    return new;
  end if;
  if new.metadata->>'åtgärd' = 'registrerade_aterbud' then
    insert into public.vikarie_aterbud(id, pass_id, datum, metadata, created_at)
    values(new.id, new.pass_id, (new.metadata->>'datum')::date, new.metadata, new.created_at)
    on conflict (id) do nothing;
  elsif new.metadata->>'åtgärd' = 'dolde_aterbud_i_utskick' then
    update public.vikarie_aterbud set hidden_at = now(), hidden_by = auth.uid()
    where new.metadata->'återbud_ids' ? id::text and hidden_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.persist_substitute_withdrawal() from public, anon, authenticated;
drop trigger if exists persist_substitute_withdrawal on public.passhistorik;
create trigger persist_substitute_withdrawal after insert on public.passhistorik
for each row execute function public.persist_substitute_withdrawal();

create or replace function public.hide_withdrawal_markers(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiler where id = auth.uid() and roll = 'admin' and aktiv) then
    raise exception 'Endast administratörer kan ta bort återbudsmarkeringar.' using errcode = '42501';
  end if;
  if cardinality(p_ids) > 500 then raise exception 'För många markeringar.'; end if;
  -- Retain the original record and audit who hid it; never change a booking.
  update public.vikarie_aterbud set hidden_at = now(), hidden_by = auth.uid()
  where id = any(p_ids) and hidden_at is null;
end;
$$;
revoke all on function public.hide_withdrawal_markers(uuid[]) from public, anon;
grant execute on function public.hide_withdrawal_markers(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
