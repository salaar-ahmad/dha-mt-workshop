-- DHA MT Workshop: database schema
-- Run once in Supabase > SQL Editor > New query > paste > Run.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Users / roles
--   ad_wksp    : AD Wksp. Everything, incl. corrections and deleting job cards
--   am_wksp    : AM Wksp. Same as AD Wksp
--   mt_clerk   : MT Clerk. Opens job cards, records every stage, raises spares demands
--   proc_clerk : Procurement Clerk. Approves / receives spares and enters costs
--   ceo        : CEO. Read only (Overview dashboard and all records)
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'mt_clerk',
  created_at timestamptz not null default now()
);
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = case role
  when 'clerk' then 'mt_clerk' when 'incharge' then 'am_wksp' when 'admin' then 'ad_wksp' when 'viewer' then 'ceo' else role end
  where role in ('clerk','incharge','admin','viewer');
alter table public.profiles add constraint profiles_role_check
  check (role in ('ad_wksp','am_wksp','mt_clerk','proc_clerk','ceo'));
alter table public.profiles alter column role set default 'mt_clerk';
alter table public.profiles add column if not exists active boolean not null default true;

-- Who created / changed which login, and when (written only by the server function)
create table if not exists public.user_admin_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  action text not null,
  target text,
  detail text
);

-- Auto-create a profile whenever a user is added in Authentication > Users.
-- Name/role can be passed as user metadata, otherwise defaults are used and
-- you can edit them afterwards in Table Editor > profiles.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'mt_clerk')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Vehicle register (master data)
-- ---------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_no text not null unique,
  category text not null default 'LTV' check (category in ('LTV','HTV','E&P Plant')),
  make text not null default '',
  model text not null default '',
  year int,
  section text not null default '',
  chassis_no text,
  engine_no text,
  meter_unit text not null default 'km' check (meter_unit in ('km','hrs')),
  current_value numeric,          -- Rs, used for the BER indicator
  is_ber boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Job cards: one per workshop visit. Stage fields are filled in order.
-- status flow:
--   received -> inspected -> awaiting_spares -> under_repair
--   -> final_inspection -> ready -> released
--   (final inspection fail returns to under_repair; inspection can end in ber)
-- ---------------------------------------------------------------
create table if not exists public.job_cards (
  id uuid primary key default gen_random_uuid(),
  job_no text unique,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  status text not null default 'received' check (status in
    ('received','inspected','awaiting_spares','under_repair','final_inspection','ready','released','ber')),

  -- 1. Receipt
  received_at timestamptz not null default now(),
  meter_in numeric,
  meter_unit text not null default 'km',
  fuel_in text,
  fault_category text,
  fault_detail text,
  brought_by text,
  section text,
  kit jsonb not null default '[]'::jsonb,
  remarks text,
  received_by text,

  -- 2. Technical inspection
  inspected_at timestamptz,
  diagnosis text,
  repair_class text check (repair_class in ('Minor','Medium','Major')),
  repair_by text check (repair_by in ('In-house','Outsourced','Recommend BER')),
  est_hours numeric,
  inspected_by text,

  -- 4. Repair
  repair_started_at timestamptz,
  mechanics text,
  work_done text,
  man_hours numeric,
  external_cost numeric,          -- outsourced / labour cost in Rs
  repair_completed_at timestamptz,

  -- 5. Final inspection
  final_inspected_at timestamptz,
  final_inspector text,
  road_test text check (road_test in ('pass','fail')),
  final_remarks text,
  fail_count int not null default 0,

  -- 6. Release
  released_at timestamptz,
  meter_out numeric,
  fuel_out text,
  handed_to text,
  release_checks jsonb not null default '[]'::jsonb,
  released_by text,
  release_remarks text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_cards_vehicle_idx on public.job_cards(vehicle_id);
create index if not exists job_cards_status_idx on public.job_cards(status);

-- Only one open job card per vehicle at a time
create unique index if not exists job_cards_one_open_per_vehicle
  on public.job_cards(vehicle_id)
  where status not in ('released','ber');

-- Job number: YYYY-<vehicle digits>-<nn>, e.g. 2026-0614-07
create or replace function public.set_job_no()
returns trigger language plpgsql as $$
declare
  v_digits text;
  yr text;
  seq int;
begin
  if new.job_no is null or new.job_no = '' then
    select lpad(coalesce(nullif(regexp_replace(vehicle_no, '\D', '', 'g'), ''), '0'), 4, '0')
      into v_digits from public.vehicles where id = new.vehicle_id;
    yr := to_char(coalesce(new.received_at, now()) at time zone 'Asia/Karachi', 'YYYY');
    select coalesce(max(nullif(split_part(job_no, '-', 3), '')::int), 0) + 1 into seq
      from public.job_cards
      where vehicle_id = new.vehicle_id and job_no like yr || '-%';
    new.job_no := yr || '-' || v_digits || '-' || lpad(seq::text, 2, '0');
  end if;
  return new;
end $$;

drop trigger if exists job_cards_set_no on public.job_cards;
create trigger job_cards_set_no before insert on public.job_cards
  for each row execute function public.set_job_no();

-- ---------------------------------------------------------------
-- Spares demands (raised against a job card)
-- status is derived: received_on set -> Received, approved_on set -> Approved, else Demanded
-- ---------------------------------------------------------------
create table if not exists public.spares (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  part_name text not null,
  part_no text,
  qty numeric not null default 1,
  source text not null default 'Store' check (source in ('Store','Local Purchase','OEM')),
  unit_cost numeric,
  demanded_on date not null default current_date,
  approved_on date,
  received_on date,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spares_job_idx on public.spares(job_card_id);

-- ---------------------------------------------------------------
-- Stage history (audit trail + time-in-status calculation)
-- ---------------------------------------------------------------
create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  at timestamptz not null default now(),
  from_status text,
  to_status text not null,
  by_name text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists job_events_job_idx on public.job_events(job_card_id);

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists vehicles_touch on public.vehicles;
create trigger vehicles_touch before update on public.vehicles for each row execute function public.touch_updated_at();
drop trigger if exists job_cards_touch on public.job_cards;
create trigger job_cards_touch before update on public.job_cards for each row execute function public.touch_updated_at();
drop trigger if exists spares_touch on public.spares;
create trigger spares_touch before update on public.spares for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active;
$$;
create or replace function public.is_writer()        -- records workshop stages
returns boolean language sql stable as $$ select coalesce(public.my_role() in ('ad_wksp','am_wksp','mt_clerk'), false) $$;
create or replace function public.is_procurer()      -- approves / receives spares
returns boolean language sql stable as $$ select coalesce(public.my_role() in ('ad_wksp','am_wksp','proc_clerk'), false) $$;
create or replace function public.is_wksp_admin()    -- corrections and deletes
returns boolean language sql stable as $$ select coalesce(public.my_role() in ('ad_wksp','am_wksp'), false) $$;

alter table public.profiles   enable row level security;
alter table public.vehicles   enable row level security;
alter table public.job_cards  enable row level security;
alter table public.spares     enable row level security;
alter table public.job_events enable row level security;

-- clear old policies
do $$
declare t text; p text;
begin
  foreach t in array array['vehicles','job_cards','spares','job_events'] loop
    foreach p in array array['read','insert','update','delete'] loop
      execute format('drop policy if exists "%s_%s" on public.%s', p, t, t);
    end loop;
    execute format('create policy "read_%1$s" on public.%1$s for select to authenticated using (true)', t);
  end loop;
end $$;

create policy "insert_vehicles"   on public.vehicles   for insert to authenticated with check (public.is_writer());
create policy "update_vehicles"   on public.vehicles   for update to authenticated using (public.is_writer()) with check (public.is_writer());
create policy "delete_vehicles"   on public.vehicles   for delete to authenticated using (public.is_wksp_admin());

create policy "insert_job_cards"  on public.job_cards  for insert to authenticated with check (public.is_writer());
create policy "update_job_cards"  on public.job_cards  for update to authenticated using (public.is_writer()) with check (public.is_writer());
create policy "delete_job_cards"  on public.job_cards  for delete to authenticated using (public.is_wksp_admin());

create policy "insert_job_events" on public.job_events for insert to authenticated with check (public.is_writer());
create policy "update_job_events" on public.job_events for update to authenticated using (public.is_wksp_admin()) with check (public.is_wksp_admin());
create policy "delete_job_events" on public.job_events for delete to authenticated using (public.is_wksp_admin());

create policy "insert_spares"     on public.spares     for insert to authenticated with check (public.is_writer());
create policy "update_spares"     on public.spares     for update to authenticated using (public.is_procurer()) with check (public.is_procurer());
create policy "delete_spares"     on public.spares     for delete to authenticated
  using (public.is_wksp_admin() or (public.is_writer() and approved_on is null and received_on is null));

drop policy if exists "read_profiles" on public.profiles;
create policy "read_profiles" on public.profiles for select to authenticated using (true);
-- No insert/update/delete policies on profiles: logins and roles change only through
-- the server function (AD Wksp) or the Supabase dashboard. Nobody can promote themselves.

alter table public.user_admin_log enable row level security;
drop policy if exists "read_user_admin_log" on public.user_admin_log;
create policy "read_user_admin_log" on public.user_admin_log for select to authenticated using (public.is_wksp_admin());

-- ---------------------------------------------------------------
-- Live updates (dashboard refreshes on every PC when anyone saves)
-- ---------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.vehicles;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.job_cards;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.spares;     exception when others then null; end;
  begin alter publication supabase_realtime add table public.job_events; exception when others then null; end;
end $$;
