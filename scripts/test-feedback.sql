-- Disposable database only; no production records.
create schema auth;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create table profiler(id uuid primary key, roll text, aktiv boolean, namn text);
create table vikarier(id uuid primary key, profil_id uuid, aktiv boolean);
create table notiser(vikarie_id uuid, mottagare text, kanal text, status text, ämne text, innehåll text, skickat_kl timestamptz);
grant usage on schema auth to authenticated;
insert into profiler values
('00000000-0000-0000-0000-000000000001','vikarie',true,'Vikarie A'),
('00000000-0000-0000-0000-000000000002','vikarie',true,'Vikarie B'),
('00000000-0000-0000-0000-000000000003','admin',true,'Admin');
insert into vikarier values
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',true),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002',true);
\ir ../supabase/migrations/20261109120000_feedback.sql
\ir ../supabase/migrations/20261109120000_feedback.sql
set role authenticated;
set test.uid='00000000-0000-0000-0000-000000000001';
select submit_feedback('00000000-0000-0000-0000-000000000021','problem','Testproblem','Beskrivning av problemet','pass');
select submit_feedback('00000000-0000-0000-0000-000000000021','problem','Testproblem','Beskrivning av problemet','pass');
do $$ begin
  assert (select count(*) from feedback)=1;
  begin
    update feedback set status='lost';
    raise exception 'Direct update allowed' using errcode='23514';
  exception when insufficient_privilege then null; end;
  begin
    perform reply_feedback('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000031','Spoofed status','lost');
    raise exception 'Status escalation allowed' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
set test.uid='00000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) from feedback)=0;
  assert (select count(*) from feedback_messages)=0;
  begin
    perform reply_feedback('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000031','Unauthorized reply');
    raise exception 'Other user reply allowed' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
set test.uid='00000000-0000-0000-0000-000000000003';
select reply_feedback('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000031','Vi undersöker detta.','arbete');
select reply_feedback('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000031','Vi undersöker detta.','arbete');
do $$ begin
  assert (select count(*) from feedback_messages)=1;
  assert (select status from feedback)='arbete';
end $$;
set test.uid='00000000-0000-0000-0000-000000000001';
select reply_feedback('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000032','Här kommer mer information.');
do $$ begin
  assert (select count(*) from feedback_messages)=2;
  begin
    perform submit_feedback('00000000-0000-0000-0000-000000000022','problem','x','kort','pass');
    raise exception 'Invalid content allowed' using errcode='P0001';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from notiser)=3;
  assert (select count(*) from notiser where mottagare='vikarie' and vikarie_id='00000000-0000-0000-0000-000000000011')=1;
end $$;
alter table notiser add constraint simulate_notification_failure check (false) not valid;
set role authenticated;
set test.uid='00000000-0000-0000-0000-000000000003';
do $$ begin
  begin
    perform reply_feedback('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000033','Status and notification must be atomic','lost');
    raise exception 'Notification failure ignored' using errcode='P0001';
  exception when check_violation then null; end;
  assert (select count(*) from feedback_messages)=2;
  assert (select status from feedback)='arbete';
end $$;
set test.uid='00000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) from feedback_messages)=0;
end $$;
reset role;
alter table notiser drop constraint simulate_notification_failure;
set test.uid='00000000-0000-0000-0000-000000000001';
update profiler set aktiv=false where id='00000000-0000-0000-0000-000000000001';
set role authenticated;
do $$ begin
  assert (select count(*) from feedback)=0;
  begin
    perform submit_feedback('00000000-0000-0000-0000-000000000022','problem','Blocked','This is blocked','pass');
    raise exception 'Inactive user allowed' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from feedback;
    raise exception 'Anonymous read allowed' using errcode='23514';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Feedback permissions, notifications, validation and idempotency passed';
