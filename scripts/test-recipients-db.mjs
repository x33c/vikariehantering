import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve('../feedback-test-runtime/package/dist/index.js')));
const db = new PGlite();
try {
  await db.exec(`create schema auth; create role authenticated; create role anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    create table profiler(id uuid, roll text);
    insert into profiler values ('00000000-0000-0000-0000-000000000001','admin'), ('00000000-0000-0000-0000-000000000002','vikarie');
    grant usage on schema auth to authenticated; grant select on profiler to authenticated;`);
  for (const file of ['20260521143000_add_utskick_celler.sql','20260525103000_allow_utskick_ingress.sql','20261119093045_utskick_recipients.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001');
    set role authenticated; set test.uid='00000000-0000-0000-0000-000000000001';
    insert into utskick_celler(datum,typ,text) values ('1970-01-01','mottagare','one@example.se');
    do $$ begin assert (select count(*) from utskick_celler)=1; end $$;
    set test.uid='00000000-0000-0000-0000-000000000002';
    do $$ begin
      assert (select count(*) from utskick_celler)=0;
      begin
        insert into utskick_celler(datum,typ,text) values ('1970-01-02','mottagare','evil@example.se');
        raise exception 'Unauthorized write allowed';
      exception when insufficient_privilege then null; end;
    end $$;
    update utskick_celler set text='evil@example.se';
    set test.uid='00000000-0000-0000-0000-000000000001';
    do $$ begin assert (select text from utskick_celler)='one@example.se'; end $$;
    set role anon;
    do $$ begin
      begin perform * from utskick_celler; raise exception 'Anonymous read allowed';
      exception when insufficient_privilege then null; end;
    end $$;`);
  console.log('PASS: migration, admin access, substitute and anonymous isolation');
} finally { await db.close(); }
