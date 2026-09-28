-- Disposable test database only.
create schema auth;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiler(id uuid primary key, roll text, aktiv boolean);
create table vikarier(id uuid primary key, profil_id uuid, aktiv boolean);
create table vikariepass(id uuid primary key, vikarie_id uuid, status text, riktad_till_vikarie_id uuid, publicerad boolean, datum date, tid_från time, tid_till time);
create table pass_forfragningar(pass_id uuid, vikarie_id uuid, status text, svarat_kl timestamptz);
create table notiser(pass_id uuid, vikarie_id uuid, mottagare text, kanal text, status text, ämne text, innehåll text, skickat_kl timestamptz);
\ir ../supabase/migrations/20260928090000_accept_replacement_request.sql
\ir ../supabase/migrations/20260928090000_accept_replacement_request.sql
insert into profiler values ('00000000-0000-0000-0000-000000000001','vikarie',true);
insert into vikarier values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',true);
insert into vikariepass values ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000012','bokat',null,false,'2026-10-01','08:00','16:00');
insert into pass_forfragningar values ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011','vantar',null),
('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000013','vantar',null);
update vikariepass set status='notifierat';
do $$ begin
  assert (select status from vikariepass) = 'bokat';
  begin
    perform accept_shift_request('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011');
    raise exception 'Anonymous acceptance allowed';
  exception when insufficient_privilege then null; end;
end $$;
set test.uid='00000000-0000-0000-0000-000000000001';
select accept_shift_request('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011');
do $$ begin
  assert (select vikarie_id from vikariepass) = '00000000-0000-0000-0000-000000000011'::uuid;
  assert (select count(*) from pass_forfragningar where status='ja') = 1;
  assert (select count(*) from pass_forfragningar where status='aterkallad') = 1;
  assert (select count(*) from notiser where vikarie_id='00000000-0000-0000-0000-000000000012') = 1;
  begin
    perform accept_shift_request('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011');
    raise exception 'Repeated acceptance allowed' using errcode='23514';
  exception when sqlstate 'P0001' then null; end;
end $$;
grant usage on schema auth to authenticated;
grant select on profiler to authenticated;
grant select, update on pass_forfragningar to authenticated;
set role authenticated;
do $$ begin
  begin
    update pass_forfragningar set status='vantar' where status='ja';
    raise exception 'Reopening request allowed' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into vikariepass values ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000012','bokat',null,false,'2026-10-02','08:00','16:00');
insert into pass_forfragningar values ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000011','vantar',null);
set role authenticated;
do $$ begin
  begin
    update pass_forfragningar set pass_id='00000000-0000-0000-0000-000000000023' where status='vantar';
    raise exception 'Moving request allowed' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
update pass_forfragningar set status='nej' where status='vantar';
reset role;
do $$ begin
  assert (select vikarie_id from vikariepass where id='00000000-0000-0000-0000-000000000022') = '00000000-0000-0000-0000-000000000012'::uuid;
end $$;
update pass_forfragningar set status='vantar' where status='nej';
-- Simulate an existing booking-conflict constraint rejecting the assignment.
alter table vikariepass add constraint simulated_overlap check (id <> '00000000-0000-0000-0000-000000000022'::uuid or vikarie_id <> '00000000-0000-0000-0000-000000000011'::uuid);
do $$ begin
  begin
    perform accept_shift_request('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000011');
    raise exception 'Conflicting assignment allowed' using errcode='P0001';
  exception when check_violation then null; end;
  assert (select vikarie_id from vikariepass where id='00000000-0000-0000-0000-000000000022') = '00000000-0000-0000-0000-000000000012'::uuid;
  assert (select status from pass_forfragningar where pass_id='00000000-0000-0000-0000-000000000022') = 'vantar';
  assert (select count(*) from notiser) = 1;
end $$;
select 'Replacement request tests passed';
