create table if not exists vikariepass_exkluderingar (
  id uuid primary key default uuid_generate_v4(),
  pass_id uuid not null references vikariepass(id) on delete cascade,
  vikarie_id uuid not null references vikarier(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(pass_id, vikarie_id)
);

create index if not exists idx_vikariepass_exkluderingar_pass on vikariepass_exkluderingar(pass_id);
create index if not exists idx_vikariepass_exkluderingar_vikarie on vikariepass_exkluderingar(vikarie_id);

alter table vikariepass_exkluderingar enable row level security;

drop policy if exists "Admin hanterar vikariepass_exkluderingar" on vikariepass_exkluderingar;
create policy "Admin hanterar vikariepass_exkluderingar" on vikariepass_exkluderingar
  for all using (auth_roll() = 'admin')
  with check (auth_roll() = 'admin');

drop policy if exists "Vikarie ser egna vikariepass_exkluderingar" on vikariepass_exkluderingar;
create policy "Vikarie ser egna vikariepass_exkluderingar" on vikariepass_exkluderingar
  for select using (vikarie_id = auth_vikarie_id());

drop policy if exists "Vikarie ser lediga pass" on vikariepass;
create policy "Vikarie ser lediga pass" on vikariepass
  for select using (
    (
      status in ('obokat', 'notifierat') and
      not exists (
        select 1
        from vikariepass_exkluderingar e
        where e.pass_id = vikariepass.id
          and e.vikarie_id = auth_vikarie_id()
      )
    ) or
    vikarie_id = auth_vikarie_id()
  );
