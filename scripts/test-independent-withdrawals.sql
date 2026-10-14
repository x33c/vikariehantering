-- Run after withdrawal tests in the disposable database only.
alter table passhistorik add column id uuid default gen_random_uuid();
alter table passhistorik add column created_at timestamptz default now();
alter table passhistorik add constraint test_history_cascade foreign key(pass_id) references vikariepass(id) on delete cascade;
insert into passhistorik(pass_id, metadata, utförd_av)
select pass_id, jsonb_build_object('åtgärd', 'dolde_aterbud_i_utskick', 'återbud_ids', jsonb_build_array(id)),
  '00000000-0000-0000-0000-000000000002'::uuid from passhistorik;
\ir ../supabase/migrations/20261014100000_independent_withdrawals.sql
\ir ../supabase/migrations/20261014100000_independent_withdrawals.sql
do $$ begin
  assert (select count(*) from vikarie_aterbud) = 1;
  assert (select hidden_at is not null from vikarie_aterbud), 'Preserve existing hidden markers';
end $$;

-- Register another withdrawal on the same shift; old hidden markers must not hide it.
update vikariepass set vikarie_id = '00000000-0000-0000-0000-000000000012', status = 'bokat'
where id = '00000000-0000-0000-0000-000000000024';
select register_substitute_withdrawal('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000012');
do $$ begin
  assert (select count(*) from vikarie_aterbud where hidden_at is null) = 1;
end $$;
delete from vikariepass where id = '00000000-0000-0000-0000-000000000024';
do $$ begin
  assert (select count(*) from passhistorik) = 0;
  assert (select count(*) from vikarie_aterbud) = 2, 'Deleting shift/history must retain absence';
  assert (select metadata->>'tid_från' from vikarie_aterbud where hidden_at is null) = '08:00:00';
end $$;

set test.uid='00000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    perform hide_withdrawal_markers(array(select id from vikarie_aterbud));
    raise exception 'Substitute could hide absence' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiler to authenticated;
set role authenticated;
do $$ begin
  assert (select count(*) from vikarie_aterbud) = 0, 'Non-admin must not read absence';
end $$;
reset role;
set test.uid='00000000-0000-0000-0000-000000000002';
set role authenticated;
do $$ begin
  assert (select count(*) from vikarie_aterbud) = 2;
  perform hide_withdrawal_markers(array(select id from vikarie_aterbud where hidden_at is null));
  assert (select count(*) from vikarie_aterbud where hidden_at is null) = 0;
  assert (select count(*) from vikarie_aterbud where hidden_by = auth.uid()) = 2;
end $$;
reset role;
select 'Independent withdrawal persistence, backfill, RLS and removal tests passed';
