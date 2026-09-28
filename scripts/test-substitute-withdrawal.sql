-- Run after test-replacement-request.sql, in the disposable database only.
create table passhistorik(pass_id uuid, händelse text, utförd_av uuid, metadata jsonb, anteckning text);
alter table vikariepass add column frånvaro_id uuid;
\ir ../supabase/migrations/20260928100000_register_substitute_withdrawal.sql
\ir ../supabase/migrations/20260928100000_register_substitute_withdrawal.sql
insert into profiler values ('00000000-0000-0000-0000-000000000002','admin',true);
insert into vikariepass values ('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000012','bokat',null,false,'2026-10-05','08:00','16:00','00000000-0000-0000-0000-000000000031');
insert into pass_forfragningar values ('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000011','vantar',null);
set test.uid='00000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    perform register_substitute_withdrawal('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000012');
    raise exception 'Substitute allowed to unregister booking' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
set test.uid='00000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    perform register_substitute_withdrawal('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000011');
    raise exception 'Stale booking accepted' using errcode='23514';
  exception when sqlstate 'P0001' then null; end;
end $$;
-- A failed history write must roll back the booking and pending requests too.
alter table passhistorik add constraint simulate_history_failure check (false);
do $$ begin
  begin
    perform register_substitute_withdrawal('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000012');
    raise exception 'Expected history failure' using errcode='P0001';
  exception when check_violation then null; end;
  assert (select vikarie_id from vikariepass where id='00000000-0000-0000-0000-000000000024') = '00000000-0000-0000-0000-000000000012'::uuid;
  assert (select status from pass_forfragningar where pass_id='00000000-0000-0000-0000-000000000024') = 'vantar';
end $$;
alter table passhistorik drop constraint simulate_history_failure;
select register_substitute_withdrawal('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000012');
do $$ begin
  assert exists (select 1 from vikariepass where id='00000000-0000-0000-0000-000000000024' and vikarie_id is null and status='obokat' and not publicerad and datum='2026-10-05' and tid_från='08:00' and tid_till='16:00' and frånvaro_id='00000000-0000-0000-0000-000000000031');
  assert (select status from pass_forfragningar where pass_id='00000000-0000-0000-0000-000000000024') = 'aterkallad';
  assert (select count(*) from passhistorik) = 1;
  assert (select count(*) from notiser where pass_id='00000000-0000-0000-0000-000000000024' and vikarie_id='00000000-0000-0000-0000-000000000012') = 1;
  begin
    perform register_substitute_withdrawal('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000012');
    raise exception 'Duplicate withdrawal accepted' using errcode='23514';
  exception when sqlstate 'P0001' then null; end;
end $$;
select 'Withdrawal transaction tests passed';
