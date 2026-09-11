begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pass-bilagor',
  'pass-bilagor',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.pass_bilagor (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.vikariepass(id) on delete cascade,
  filnamn text not null,
  storage_path text not null unique,
  mime_type text,
  storlek int,
  uppladdad_av uuid references public.profiler(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pass_bilagor_pass
  on public.pass_bilagor(pass_id);

alter table public.pass_bilagor enable row level security;
revoke all on public.pass_bilagor from anon;
grant select, insert, update, delete on public.pass_bilagor to authenticated, service_role;

drop policy if exists "Admin hanterar passbilagor" on public.pass_bilagor;
create policy "Admin hanterar passbilagor"
  on public.pass_bilagor
  for all
  to authenticated
  using (auth_roll() = 'admin')
  with check (auth_roll() = 'admin');

drop policy if exists "Vikarie ser egna passbilagor" on public.pass_bilagor;
create policy "Vikarie ser egna passbilagor"
  on public.pass_bilagor
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vikariepass vp
      where vp.id = pass_bilagor.pass_id
        and (
          vp.vikarie_id = auth_vikarie_id()
          or (vp.vikarie_id is null and vp.status in ('obokat', 'notifierat') and (
            vp.riktad_till_vikarie_id = auth_vikarie_id()
            or exists (
            select 1
            from public.pass_forfragningar pf
            where pf.pass_id = vp.id
              and pf.vikarie_id = auth_vikarie_id()
              and pf.status = 'vantar'
            )
          ))
        )
    )
  );

drop policy if exists "Admin hanterar passbilagefiler" on storage.objects;
create policy "Admin hanterar passbilagefiler"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'pass-bilagor'
    and auth_roll() = 'admin'
  )
  with check (
    bucket_id = 'pass-bilagor'
    and auth_roll() = 'admin'
  );

drop policy if exists "Vikarie laser egna passbilagefiler" on storage.objects;
create policy "Vikarie laser egna passbilagefiler"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'pass-bilagor'
    and exists (
      select 1
      from public.pass_bilagor pb
      join public.vikariepass vp on vp.id = pb.pass_id
      where pb.storage_path = storage.objects.name
        and (
          vp.vikarie_id = auth_vikarie_id()
          or (vp.vikarie_id is null and vp.status in ('obokat', 'notifierat') and (
            vp.riktad_till_vikarie_id = auth_vikarie_id()
            or exists (
            select 1
            from public.pass_forfragningar pf
            where pf.pass_id = vp.id
              and pf.vikarie_id = auth_vikarie_id()
              and pf.status = 'vantar'
            )
          ))
        )
    )
  );

alter table public.pass_bilagor replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.pass_bilagor;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
