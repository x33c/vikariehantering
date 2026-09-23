-- Run only in an empty disposable database.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create table public.profiler (id uuid primary key, roll text, aktiv boolean, namn text);
insert into public.profiler values
  ('00000000-0000-0000-0000-000000000001', 'admin', true, 'Admin'),
  ('00000000-0000-0000-0000-000000000002', 'vikarie', true, 'Substitute');
\ir ../supabase/migrations/20260923100000_protect_profile_permissions.sql
\ir ../supabase/migrations/20260923100000_protect_profile_permissions.sql
set test.uid = '00000000-0000-0000-0000-000000000002';
update public.profiler set namn = 'Changed' where id = auth.uid();
do $$ begin
  assert (select namn from public.profiler where id = auth.uid()) = 'Changed';
  begin
    update public.profiler set roll = 'admin' where id = auth.uid();
    raise exception 'Self-promotion was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiler set aktiv = false where id = auth.uid();
    raise exception 'Self-service permissions change was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiler set id = gen_random_uuid() where id = auth.uid();
    raise exception 'Identity change was allowed';
  exception when insufficient_privilege then null; end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000001';
update public.profiler set roll = 'admin' where id = '00000000-0000-0000-0000-000000000002';
update public.profiler set roll = 'vikarie', aktiv = false where id = '00000000-0000-0000-0000-000000000002';
set test.uid = '00000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    update public.profiler set aktiv = true where id = auth.uid();
    raise exception 'Self-reactivation was allowed';
  exception when insufficient_privilege then null; end;
end $$;
-- Trusted service-role calls have no user UID and remain supported.
set test.uid = '';
update public.profiler set aktiv = true where id = '00000000-0000-0000-0000-000000000002';
select 'Profile permission checks passed' as result;
