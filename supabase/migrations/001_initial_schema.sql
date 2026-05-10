-- ============================================================
-- Vikariehantering – Initial Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type pass_status as enum (
  'obokat',
  'notifierat',
  'bokat',
  'bekräftat',
  'avbokat'
);

create type händelse_typ as enum (
  'pass_skapat',
  'pass_uppdaterat',
  'vikarie_notifierat',
  'vikarie_bokat',
  'bokning_bekräftad',
  'pass_avbokat',
  'vikarie_borttagen'
);

create type notis_kanal as enum (
  'epost',
  'sms',
  'push'
);

create type notis_status as enum (
  'väntande',
  'skickat',
  'misslyckat'
);

create type pass_typ as enum (
  'hel_dag',
  'del_av_dag'
);

-- ============================================================
-- PROFILER (extends auth.users)
-- ============================================================

create table profiler (
  id            uuid primary key references auth.users(id) on delete cascade,
  roll          text not null check (roll in ('admin', 'vikarie')),
  namn          text,
  epost         text,
  telefon       text,
  aktiv         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- ARBETSLAG
-- ============================================================

create table arbetslag (
  id            uuid primary key default uuid_generate_v4(),
  namn          text not null,
  beskrivning   text,
  färg          text default '#3B82F6',
  aktiv         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- PERSONAL
-- ============================================================

create table personal (
  id              uuid primary key default uuid_generate_v4(),
  arbetslag_id    uuid references arbetslag(id) on delete set null,
  namn            text not null,
  epost           text,
  telefon         text,
  signatur        text unique,
  skola24_id      text unique,
  titel           text,
  aktiv           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_personal_arbetslag on personal(arbetslag_id);
create index idx_personal_signatur on personal(signatur);
create index idx_personal_skola24_id on personal(skola24_id);

-- ============================================================
-- VIKARIER
-- ============================================================

create table vikarier (
  id              uuid primary key default uuid_generate_v4(),
  profil_id       uuid references profiler(id) on delete set null,
  namn            text not null,
  epost           text,
  telefon         text,
  ämnen           text[],
  stadier         text[],
  anteckning      text,
  aktiv           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_vikarier_profil on vikarier(profil_id);

-- ============================================================
-- VIKARIE TILLGÄNGLIGHET
-- ============================================================

create table vikarie_tillgänglighet (
  id              uuid primary key default uuid_generate_v4(),
  vikarie_id      uuid not null references vikarier(id) on delete cascade,
  datum           date,
  veckodag        int check (veckodag between 0 and 6), -- 0=sön, 1=mån…
  tillgänglig     boolean not null default true,
  tid_från        time,
  tid_till        time,
  återkommande    boolean not null default false,
  anteckning      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint datum_eller_veckodag check (
    (datum is not null and veckodag is null) or
    (datum is null and veckodag is not null)
  )
);

create index idx_tillg_vikarie on vikarie_tillgänglighet(vikarie_id);
create index idx_tillg_datum on vikarie_tillgänglighet(datum);

-- ============================================================
-- FRÅNVARO
-- ============================================================

create table frånvaro (
  id              uuid primary key default uuid_generate_v4(),
  personal_id     uuid not null references personal(id) on delete cascade,
  datum_från      date not null,
  datum_till      date not null,
  hel_dag         boolean not null default true,
  tid_från        time,
  tid_till        time,
  orsak           text,
  anteckning      text,
  skapad_av       uuid references profiler(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint datum_ordning check (datum_till >= datum_från)
);

create index idx_frånvaro_personal on frånvaro(personal_id);
create index idx_frånvaro_datum on frånvaro(datum_från, datum_till);

-- ============================================================
-- SCHEMAIMPORT
-- ============================================================

create table schemaimport (
  id              uuid primary key default uuid_generate_v4(),
  filnamn         text not null,
  källa           text default 'skola24',
  kolumnmappning  jsonb,
  radantal        int,
  matchade        int default 0,
  omatchade       int default 0,
  importerad_av   uuid references profiler(id),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- SCHEMARADER
-- ============================================================

create table schemarader (
  id              uuid primary key default uuid_generate_v4(),
  import_id       uuid not null references schemaimport(id) on delete cascade,
  personal_id     uuid references personal(id) on delete set null,
  rå_data         jsonb not null,
  datum           date,
  tid_från        time,
  tid_till        time,
  ämne            text,
  grupp           text,
  sal             text,
  signatur        text,
  matchningsstatus text check (matchningsstatus in ('matchad', 'osäker', 'omatchad', 'ignorerad')) default 'omatchad',
  created_at      timestamptz not null default now()
);

create index idx_schemarader_import on schemarader(import_id);
create index idx_schemarader_personal on schemarader(personal_id);
create index idx_schemarader_datum on schemarader(datum);

-- ============================================================
-- VIKARIEPASS
-- ============================================================

create table vikariepass (
  id              uuid primary key default uuid_generate_v4(),
  frånvaro_id     uuid references frånvaro(id) on delete set null,
  schemarad_id    uuid references schemarader(id) on delete set null,
  personal_id     uuid references personal(id) on delete set null,
  vikarie_id      uuid references vikarier(id) on delete set null,
  datum           date not null,
  tid_från        time not null,
  tid_till        time not null,
  typ             pass_typ not null default 'hel_dag',
  ämne            text,
  grupp           text,
  sal             text,
  anteckning      text,
  status          pass_status not null default 'obokat',
  skapad_av       uuid references profiler(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_pass_datum on vikariepass(datum);
create index idx_pass_status on vikariepass(status);
create index idx_pass_vikarie on vikariepass(vikarie_id);
create index idx_pass_personal on vikariepass(personal_id);
create index idx_pass_frånvaro on vikariepass(frånvaro_id);

-- ============================================================
-- PASSHISTORIK
-- ============================================================

create table passhistorik (
  id              uuid primary key default uuid_generate_v4(),
  pass_id         uuid not null references vikariepass(id) on delete cascade,
  händelse        händelse_typ not null,
  utförd_av       uuid references profiler(id),
  metadata        jsonb,
  anteckning      text,
  created_at      timestamptz not null default now()
);

create index idx_historik_pass on passhistorik(pass_id);
create index idx_historik_händelse on passhistorik(händelse);

-- ============================================================
-- NOTISER
-- ============================================================

create table notiser (
  id              uuid primary key default uuid_generate_v4(),
  pass_id         uuid not null references vikariepass(id) on delete cascade,
  vikarie_id      uuid references vikarier(id) on delete set null,
  kanal           notis_kanal not null default 'epost',
  status          notis_status not null default 'väntande',
  mottagare       text not null,
  ämne            text,
  innehåll        text,
  skickat_kl      timestamptz,
  felmeddelande   text,
  created_at      timestamptz not null default now()
);

create index idx_notiser_pass on notiser(pass_id);
create index idx_notiser_vikarie on notiser(vikarie_id);
create index idx_notiser_status on notiser(status);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function uppdatera_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trig_profiler_updated before update on profiler
  for each row execute function uppdatera_updated_at();
create trigger trig_arbetslag_updated before update on arbetslag
  for each row execute function uppdatera_updated_at();
create trigger trig_personal_updated before update on personal
  for each row execute function uppdatera_updated_at();
create trigger trig_vikarier_updated before update on vikarier
  for each row execute function uppdatera_updated_at();
create trigger trig_tillg_updated before update on vikarie_tillgänglighet
  for each row execute function uppdatera_updated_at();
create trigger trig_frånvaro_updated before update on frånvaro
  for each row execute function uppdatera_updated_at();
create trigger trig_pass_updated before update on vikariepass
  for each row execute function uppdatera_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================================

create or replace function hantera_ny_användare()
returns trigger language plpgsql security definer as $$
begin
  insert into profiler (id, roll, epost, namn)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'roll', 'vikarie'),
    new.email,
    coalesce(new.raw_user_meta_data->>'namn', new.email)
  );
  return new;
end;
$$;

create trigger trig_ny_användare
  after insert on auth.users
  for each row execute function hantera_ny_användare();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiler enable row level security;
alter table arbetslag enable row level security;
alter table personal enable row level security;
alter table vikarier enable row level security;
alter table vikarie_tillgänglighet enable row level security;
alter table frånvaro enable row level security;
alter table schemaimport enable row level security;
alter table schemarader enable row level security;
alter table vikariepass enable row level security;
alter table passhistorik enable row level security;
alter table notiser enable row level security;

-- Helper: roll för inloggad användare
create or replace function auth_roll()
returns text language sql security definer stable as $$
  select roll from profiler where id = auth.uid();
$$;

-- Helper: vikarie_id för inloggad vikarie
create or replace function auth_vikarie_id()
returns uuid language sql security definer stable as $$
  select v.id from vikarier v
  join profiler p on p.id = v.profil_id
  where p.id = auth.uid();
$$;

-- PROFILER
create policy "Användare ser sin egen profil" on profiler
  for select using (id = auth.uid() or auth_roll() = 'admin');
create policy "Användare uppdaterar sin profil" on profiler
  for update using (id = auth.uid() or auth_roll() = 'admin');
create policy "Admin skapar profiler" on profiler
  for insert with check (auth_roll() = 'admin');

-- ARBETSLAG
create policy "Alla inloggade ser arbetslag" on arbetslag
  for select using (auth.uid() is not null);
create policy "Admin hanterar arbetslag" on arbetslag
  for all using (auth_roll() = 'admin');

-- PERSONAL
create policy "Alla inloggade ser personal" on personal
  for select using (auth.uid() is not null);
create policy "Admin hanterar personal" on personal
  for all using (auth_roll() = 'admin');

-- VIKARIER
create policy "Vikarier ser sig själva" on vikarier
  for select using (profil_id = auth.uid() or auth_roll() = 'admin');
create policy "Admin hanterar vikarier" on vikarier
  for all using (auth_roll() = 'admin');
create policy "Vikarie uppdaterar sig själv" on vikarier
  for update using (profil_id = auth.uid());

-- VIKARIE_TILLGÄNGLIGHET
create policy "Vikarie hanterar sin tillgänglighet" on vikarie_tillgänglighet
  for all using (
    vikarie_id = auth_vikarie_id() or auth_roll() = 'admin'
  );

-- FRÅNVARO
create policy "Admin hanterar frånvaro" on frånvaro
  for all using (auth_roll() = 'admin');

-- SCHEMAIMPORT
create policy "Admin hanterar schemaimport" on schemaimport
  for all using (auth_roll() = 'admin');

-- SCHEMARADER
create policy "Admin hanterar schemarader" on schemarader
  for all using (auth_roll() = 'admin');

-- VIKARIEPASS
create policy "Admin hanterar vikariepass" on vikariepass
  for all using (auth_roll() = 'admin');
create policy "Vikarie ser lediga pass" on vikariepass
  for select using (
    status in ('obokat', 'notifierat') or
    vikarie_id = auth_vikarie_id()
  );
create policy "Vikarie bokar pass" on vikariepass
  for update using (
    vikarie_id is null and
    status in ('obokat', 'notifierat') and
    auth_roll() = 'vikarie'
  );

-- PASSHISTORIK
create policy "Admin ser historik" on passhistorik
  for select using (auth_roll() = 'admin');
create policy "System skapar historik" on passhistorik
  for insert with check (auth.uid() is not null);

-- NOTISER
create policy "Admin hanterar notiser" on notiser
  for all using (auth_roll() = 'admin');
create policy "Vikarie ser sina notiser" on notiser
  for select using (vikarie_id = auth_vikarie_id());
