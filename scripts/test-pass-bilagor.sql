-- Only run in an empty, disposable PostgreSQL database.
create role anon;
create role authenticated;
create role service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
create table public.profiler (id uuid primary key);
create table public.vikariepass (id uuid primary key, vikarie_id uuid, riktad_till_vikarie_id uuid, status text);
create table public.pass_forfragningar (pass_id uuid, vikarie_id uuid, status text);
grant select on public.vikariepass, public.pass_forfragningar to authenticated;
create function public.auth_roll() returns text language sql stable as $$ select current_setting('test.roll', true) $$;
create function public.auth_vikarie_id() returns uuid language sql stable as $$ select nullif(current_setting('test.vikarie', true), '')::uuid $$;
create publication supabase_realtime;

\ir ../supabase/migrations/20260911123000_add_pass_bilagor.sql
-- It must also be safe to re-run after a failed deployment response.
\ir ../supabase/migrations/20260911123000_add_pass_bilagor.sql

insert into public.vikariepass values ('00000000-0000-0000-0000-000000000001', null, null, 'notifierat');
insert into public.pass_forfragningar values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'vantar'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'vantar');
set role authenticated;
set test.roll = 'admin';
insert into public.pass_bilagor (pass_id, filnamn, storage_path) values
  ('00000000-0000-0000-0000-000000000001', 'Planering.pdf', '00000000-0000-0000-0000-000000000001/planering.pdf');
insert into storage.objects (bucket_id, name) values ('pass-bilagor', '00000000-0000-0000-0000-000000000001/planering.pdf');

set test.roll = 'vikarie';
set test.vikarie = '00000000-0000-0000-0000-000000000011';
do $$ begin
  assert (select count(*) from public.pass_bilagor) = 1, 'Pending recipient must see metadata';
  assert (select count(*) from storage.objects) = 1, 'Pending recipient must see file';
  begin
    insert into public.pass_bilagor (pass_id, filnamn, storage_path) values
      ('00000000-0000-0000-0000-000000000001', 'Forbidden', 'forbidden');
    raise exception 'Substitute must not upload metadata';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('pass-bilagor', 'forbidden');
    raise exception 'Substitute must not upload files';
  exception when insufficient_privilege then null; end;
  delete from public.pass_bilagor;
  assert (select count(*) from public.pass_bilagor) = 1, 'Substitute must not delete metadata';
  delete from storage.objects;
  assert (select count(*) from storage.objects) = 1, 'Substitute must not delete files';
end $$;

set test.vikarie = '00000000-0000-0000-0000-000000000013';
do $$ begin
  assert (select count(*) from public.pass_bilagor) = 0, 'Unrelated substitute must not see metadata';
  assert (select count(*) from storage.objects) = 0, 'Unrelated substitute must not see file';
end $$;

reset role;
update public.pass_forfragningar set status = 'nej' where vikarie_id = '00000000-0000-0000-0000-000000000011';
set role authenticated;
set test.vikarie = '00000000-0000-0000-0000-000000000011';
do $$ begin
  assert (select count(*) from public.pass_bilagor) = 0, 'Declined recipient must lose access';
  assert (select count(*) from storage.objects) = 0, 'Declined recipient must lose file access';
end $$;

reset role;
update public.vikariepass set vikarie_id = '00000000-0000-0000-0000-000000000011', status = 'bokat';
set role authenticated;
do $$ begin
  assert (select count(*) from public.pass_bilagor) = 1, 'Booked substitute must see metadata';
  assert (select count(*) from storage.objects) = 1, 'Booked substitute must see file';
end $$;
set test.vikarie = '00000000-0000-0000-0000-000000000012';
do $$ begin
  assert (select count(*) from public.pass_bilagor) = 0, 'Other pending recipient must lose access after booking';
  assert (select count(*) from storage.objects) = 0, 'Other pending recipient must lose file access after booking';
end $$;

set test.roll = 'admin';
delete from storage.objects;
delete from public.pass_bilagor;
do $$ begin
  assert (select count(*) from public.pass_bilagor) = 0, 'Admin can delete metadata';
  assert (select count(*) from storage.objects) = 0, 'Admin can delete file';
end $$;
reset role;
do $$ begin
  assert not has_table_privilege('anon', 'public.pass_bilagor', 'SELECT'), 'Anonymous access must be denied';
  assert (select not public and file_size_limit = 10485760 from storage.buckets where id = 'pass-bilagor'), 'Private bucket with 10 MB limit';
end $$;
select 'PASS: attachment permissions and repeatable migration' as result;
