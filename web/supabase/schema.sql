-- HostelPulse schema. Run in the Supabase SQL editor.
--
-- Safe to run more than once, and it upgrades the tables from the earlier version
-- of this file (adds the missing properties columns, replaces the old
-- finding_actions table, which only held test data).
--
-- Security model: every table is protected by row-level security. A signed-in
-- user can only touch rows that belong to a property they own.

create table if not exists public.properties (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  beds       int  not null check (beds between 1 and 2000),
  currency   text not null default 'USD',
  country    text not null default '',
  created_at timestamptz not null default now()
);
-- Upgrade from the earlier version, whose properties table lacked these columns.
alter table public.properties add column if not exists currency text not null default 'USD';
alter table public.properties add column if not exists country  text not null default '';

create unique index if not exists properties_one_per_owner on public.properties(owner_id);

create or replace function public.owns_property(pid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.properties p where p.id = pid and p.owner_id = auth.uid()) $$;

-- Monthly figures typed in by the manager (onboarding and settings).
create table if not exists public.cost_inputs (
  property_id     uuid not null references public.properties(id) on delete cascade,
  month           text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  rent_cents      bigint not null default 0 check (rent_cents >= 0),
  utilities_cents bigint not null default 0 check (utilities_cents >= 0),
  staff_cents     bigint not null default 0 check (staff_cents >= 0),
  breakfast_cents bigint not null default 0 check (breakfast_cents >= 0),
  laundry_cents   bigint not null default 0 check (laundry_cents >= 0),
  updated_at      timestamptz not null default now(),
  primary key (property_id, month)
);

-- One row per uploaded file. file_hash stops the same file being imported twice.
create table if not exists public.imports (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  kind        text not null check (kind in ('bookings','bank','utilities','schedule','expenses')),
  filename    text not null,
  file_hash   text not null,
  rows_ok     int  not null default 0,
  rows_failed int  not null default 0,
  errors      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  unique (property_id, kind, file_hash)
);

create table if not exists public.bookings (
  property_id   uuid not null references public.properties(id) on delete cascade,
  external_id   text not null,
  import_id     uuid references public.imports(id) on delete set null,
  channel       text not null check (channel in ('direct','ota','other')),
  check_in      date not null,
  nights        int  not null check (nights > 0),
  revenue_cents bigint not null default 0,
  guest_key     text,
  primary key (property_id, external_id)
);
create index if not exists bookings_by_date on public.bookings(property_id, check_in);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  import_id    uuid references public.imports(id) on delete set null,
  date         date not null,
  amount_cents bigint not null check (amount_cents > 0),
  merchant     text not null,
  category     text not null check (category in ('laundry','utilities','staff','software','channel_commission','supplies','rent','breakfast','other'))
);
create index if not exists expenses_by_date on public.expenses(property_id, date);

create table if not exists public.shifts (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties(id) on delete cascade,
  import_id         uuid references public.imports(id) on delete set null,
  employee          text not null,
  date              date not null,
  hours             numeric(5,2) not null check (hours > 0 and hours <= 24),
  hourly_rate_cents int not null check (hourly_rate_cents > 0)
);
create index if not exists shifts_by_date on public.shifts(property_id, date);

-- PMS connections. credentials_enc is AES-256-GCM ciphertext created on the
-- server with CREDENTIALS_ENCRYPTION_KEY, which is never stored in the database.
create table if not exists public.connections (
  property_id     uuid not null references public.properties(id) on delete cascade,
  provider        text not null check (provider in ('cloudbeds','hostaway','little_hotelier')),
  status          text not null default 'saved_unverified' check (status in ('saved_unverified','connected','error')),
  credentials_enc text not null,
  clear_fields    jsonb not null default '{}'::jsonb,
  secret_masks    jsonb not null default '{}'::jsonb,
  message         text,
  updated_at      timestamptz not null default now(),
  last_sync_at    timestamptz,
  primary key (property_id, provider)
);

-- The earlier version keyed finding_actions by a text property id. Replace it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'finding_actions'
      and column_name = 'property_id' and data_type = 'text'
  ) then
    drop table public.finding_actions;
  end if;
end $$;

create table if not exists public.finding_actions (
  property_id  uuid not null references public.properties(id) on delete cascade,
  finding_id   text not null check (char_length(finding_id) <= 120),
  addressed_at timestamptz not null default now(),
  primary key (property_id, finding_id)
);

create table if not exists public.review_snapshots (
  property_id  uuid not null references public.properties(id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  rating       numeric(2,1) not null check (rating between 1 and 5),
  review_count int not null check (review_count >= 0),
  impressions  int check (impressions >= 0),
  primary key (property_id, month)
);

-- Row-level security.
alter table public.properties       enable row level security;
alter table public.cost_inputs      enable row level security;
alter table public.imports          enable row level security;
alter table public.bookings         enable row level security;
alter table public.expenses         enable row level security;
alter table public.shifts           enable row level security;
alter table public.connections      enable row level security;
alter table public.finding_actions  enable row level security;
alter table public.review_snapshots enable row level security;

drop policy if exists "owners manage their properties" on public.properties; -- name used by the earlier version
drop policy if exists "owners manage their property" on public.properties;
create policy "owners manage their property" on public.properties
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['cost_inputs','imports','bookings','expenses','shifts','connections','finding_actions','review_snapshots']
  loop
    execute format('drop policy if exists "owners manage %1$s" on public.%1$I', t);
    execute format(
      'create policy "owners manage %1$s" on public.%1$I for all to authenticated using (public.owns_property(property_id)) with check (public.owns_property(property_id))',
      t);
  end loop;
end $$;
