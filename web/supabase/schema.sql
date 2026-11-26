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
-- Onboarding profile: which OTAs, website and social links (used for pricing and SEO features).
alter table public.properties add column if not exists otas            text[] not null default '{}';
alter table public.properties add column if not exists website         text;
alter table public.properties add column if not exists socials         jsonb not null default '{}'::jsonb;
alter table public.properties add column if not exists postal_address  text not null default '';
alter table public.properties add column if not exists reply_to_email  text not null default '';
alter table public.properties add column if not exists ota_settings    jsonb not null default '{}'::jsonb;
-- Limits on automatic price changes (see the app's guardrails).
alter table public.properties add column if not exists guardrails      jsonb not null default '{}'::jsonb;

create unique index if not exists properties_one_per_owner on public.properties(owner_id);

-- Team access: up to 1 seat (free) or 3 seats (team) per property. Billing comes later; plan is a flag.
alter table public.properties add column if not exists plan text not null default 'free';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_plan_check') then
    alter table public.properties add constraint properties_plan_check check (plan in ('free','team'));
  end if;
end $$;

create table if not exists public.property_members (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null default '',
  role        text not null default 'manager' check (role in ('owner','manager')),
  primary key (property_id, user_id)
);
create index if not exists property_members_by_user on public.property_members(user_id);

create table if not exists public.property_invites (
  property_id uuid not null references public.properties(id) on delete cascade,
  email       text not null check (email = lower(email)),
  invited_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (property_id, email)
);

-- Existing owners become members (safe to re-run).
insert into public.property_members (property_id, user_id, email, role)
select p.id, p.owner_id, coalesce((select u.email from auth.users u where u.id = p.owner_id), ''), 'owner'
from public.properties p
on conflict do nothing;

create or replace function public.is_member(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.property_members m where m.property_id = pid and m.user_id = auth.uid()) $$;

create or replace function public.is_owner(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.property_members m where m.property_id = pid and m.user_id = auth.uid() and m.role = 'owner') $$;

-- A new property's creator becomes its owner member.
create or replace function public.add_owner_member()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.property_members (property_id, user_id, email, role)
  values (new.id, new.owner_id, coalesce((select u.email from auth.users u where u.id = new.owner_id), ''), 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists properties_add_owner on public.properties;
create trigger properties_add_owner after insert on public.properties
  for each row execute function public.add_owner_member();

-- Seat limit enforced in the database too, so it cannot be bypassed from the API.
create or replace function public.enforce_seat_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare seats int; used int;
begin
  select case when plan = 'team' then 3 else 1 end into seats from public.properties where id = new.property_id;
  select (select count(*) from public.property_members where property_id = new.property_id)
       + (select count(*) from public.property_invites where property_id = new.property_id) into used;
  if used >= seats then
    raise exception 'seat limit reached for this plan' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists property_invites_seat_limit on public.property_invites;
create trigger property_invites_seat_limit before insert on public.property_invites
  for each row execute function public.enforce_seat_limit();

-- An invited person joins by signing in with the invited email. Runs as the database so it
-- can add them as a member; it only ever adds the caller, never anyone else.
create or replace function public.accept_invites()
returns uuid language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); mail text; pid uuid; seats int; used int; joined uuid;
begin
  if uid is null then return null; end if;
  select lower(email) into mail from auth.users where id = uid;
  if mail is null then return null; end if;
  if exists (select 1 from public.property_members where user_id = uid) then return null; end if;
  for pid in select i.property_id from public.property_invites i where i.email = mail loop
    select case when plan = 'team' then 3 else 1 end into seats from public.properties where id = pid;
    select count(*) into used from public.property_members where property_id = pid;
    if used < seats and joined is null then
      insert into public.property_members (property_id, user_id, email, role) values (pid, uid, mail, 'manager') on conflict do nothing;
      joined := pid;
    end if;
    delete from public.property_invites where property_id = pid and email = mail;
  end loop;
  return joined;
end $$;
revoke all on function public.accept_invites() from public;
grant execute on function public.accept_invites() to authenticated;

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

-- Every automated change, from proposal to approval to (maybe) undo. This is the audit log.
create table if not exists public.automation_runs (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  kind        text not null check (kind in ('price_update','email_campaign','ticket_draft','content_draft')),
  title       text not null check (char_length(title) between 1 and 200),
  params      jsonb not null default '{}'::jsonb,
  before      jsonb,
  after       jsonb,
  status      text not null default 'proposed' check (status in ('proposed','approved','applied','failed','undone','rejected')),
  reversible  boolean not null default false,
  simulated   boolean not null default true,
  created_by  uuid not null default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  applied_at  timestamptz,
  error       text
);
create index if not exists automation_runs_by_property on public.automation_runs(property_id, created_at desc);

-- The competitor set a hostel compares itself against (at most 8, names unique ignoring case).
create table if not exists public.competitors (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now()
);
create unique index if not exists competitors_unique_name on public.competitors(property_id, lower(name));

create or replace function public.enforce_competitor_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.competitors where property_id = new.property_id) >= 8 then
    raise exception 'competitor limit reached' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists competitors_limit on public.competitors;
create trigger competitors_limit before insert on public.competitors
  for each row execute function public.enforce_competitor_limit();

-- Nightly rates. Append-only: the newest snapshot for a night/channel is the current rate.
create table if not exists public.rate_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  property_id            uuid not null references public.properties(id) on delete cascade,
  stay_date              date not null,
  channel                text not null check (char_length(channel) between 1 and 40),
  competitor_id          uuid references public.competitors(id) on delete cascade,
  room_type              text not null default 'Dorm bed' check (char_length(room_type) between 1 and 60),
  price_cents            int  not null check (price_cents > 0 and price_cents < 10000000),
  discounted_price_cents int  check (discounted_price_cents > 0),
  discount_label         text,
  source                 text not null check (source in ('pms','manual','provider','simulated')),
  captured_at            timestamptz not null default now()
);
create index if not exists rate_snapshots_lookup on public.rate_snapshots(property_id, stay_date, channel);

-- Requests to booking sites (for example "stop bidding on our name"). One per site; sent by hand.
create table if not exists public.ota_tickets (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  ota_id       text not null check (char_length(ota_id) between 1 and 40),
  status       text not null default 'draft' check (status in ('draft','submitted','answered')),
  subject      text not null check (char_length(subject) between 1 and 300),
  body         text not null check (char_length(body) between 1 and 5000),
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  answered_at  timestamptz,
  unique (property_id, ota_id)
);

-- Repeat-guest email. Suppressions are added by the signed unsubscribe link (service key) and read by members.
create table if not exists public.email_suppressions (
  property_id uuid not null references public.properties(id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 254),
  created_at  timestamptz not null default now(),
  primary key (property_id, email)
);
-- What was sent (or held back). Addresses are masked: the full address is never kept here.
create table if not exists public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  masked_email text not null,
  subject     text not null check (char_length(subject) between 1 and 300),
  status      text not null check (status in ('sent','failed','not_sent')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_outbox_by_property on public.email_outbox(property_id, created_at desc);
create table if not exists public.email_campaigns (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  template    text not null check (template in ('welcome_back','seasonal','review_request')),
  subject     text not null,
  audience    int  not null check (audience >= 0),
  sent        int  not null check (sent >= 0),
  skipped     int  not null check (skipped >= 0),
  mode        text not null check (mode in ('sent','outbox')),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
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
alter table public.property_members enable row level security;
alter table public.property_invites enable row level security;
alter table public.cost_inputs      enable row level security;
alter table public.imports          enable row level security;
alter table public.bookings         enable row level security;
alter table public.expenses         enable row level security;
alter table public.shifts           enable row level security;
alter table public.connections      enable row level security;
alter table public.finding_actions  enable row level security;
alter table public.review_snapshots enable row level security;
alter table public.automation_runs  enable row level security;
alter table public.competitors      enable row level security;
alter table public.rate_snapshots   enable row level security;
alter table public.ota_tickets      enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.email_outbox       enable row level security;
alter table public.email_campaigns    enable row level security;

drop policy if exists "owners manage their properties" on public.properties; -- name used by the earliest version
drop policy if exists "owners manage their property" on public.properties;
drop policy if exists "members read property" on public.properties;
drop policy if exists "users create their property" on public.properties;
drop policy if exists "owners update property" on public.properties;
drop policy if exists "owners delete property" on public.properties;
-- owner_id = auth.uid() lets the creator read the row straight after inserting it.
create policy "members read property" on public.properties
  for select to authenticated using (public.is_member(id) or owner_id = auth.uid());
create policy "users create their property" on public.properties
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update property" on public.properties
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy "owners delete property" on public.properties
  for delete to authenticated using (public.is_owner(id));

drop policy if exists "members read members" on public.property_members;
drop policy if exists "owners remove members" on public.property_members;
create policy "members read members" on public.property_members
  for select to authenticated using (public.is_member(property_id));
create policy "owners remove members" on public.property_members
  for delete to authenticated using (public.is_owner(property_id) and role <> 'owner');

drop policy if exists "owners manage invites" on public.property_invites;
create policy "owners manage invites" on public.property_invites
  for all to authenticated using (public.is_owner(property_id)) with check (public.is_owner(property_id));

do $$
declare t text;
begin
  foreach t in array array['cost_inputs','imports','bookings','expenses','shifts','connections','finding_actions','review_snapshots','competitors','rate_snapshots','ota_tickets','email_suppressions','email_outbox','email_campaigns']
  loop
    execute format('drop policy if exists "owners manage %1$s" on public.%1$I', t);
    execute format(
      'create policy "owners manage %1$s" on public.%1$I for all to authenticated using (public.is_member(property_id)) with check (public.is_member(property_id))',
      t);
  end loop;
end $$;

-- Automation runs: members read and update; a member can only create runs as themselves; nobody deletes.
drop policy if exists "members read runs" on public.automation_runs;
drop policy if exists "members create runs" on public.automation_runs;
drop policy if exists "members update runs" on public.automation_runs;
create policy "members read runs" on public.automation_runs
  for select to authenticated using (public.is_member(property_id));
create policy "members create runs" on public.automation_runs
  for insert to authenticated with check (public.is_member(property_id) and created_by = auth.uid());
create policy "members update runs" on public.automation_runs
  for update to authenticated using (public.is_member(property_id)) with check (public.is_member(property_id));

-- Let signed-in users reach these tables through the API. Newer Supabase projects
-- do not grant this automatically, which shows up as "permission denied for table".
-- Row-level security above still limits every user to their own rows. Signed-out
-- visitors (the anon role) have no policy, so they can read and write nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.cost_inputs,
  public.imports,
  public.bookings,
  public.expenses,
  public.shifts,
  public.connections,
  public.finding_actions,
  public.review_snapshots
to authenticated;

-- properties: column-level grants so nobody can set their own plan or owner through the API.
revoke all on public.properties from authenticated;
grant select, delete on public.properties to authenticated;
grant insert (name, beds, currency, country, otas, website, socials, postal_address, reply_to_email, ota_settings) on public.properties to authenticated;
grant update (name, beds, currency, country, otas, website, socials, postal_address, reply_to_email, ota_settings, guardrails) on public.properties to authenticated;
grant select, insert, update on public.automation_runs to authenticated;

grant select, delete on public.property_members to authenticated;
grant select, insert, delete on public.property_invites to authenticated;
grant select, insert, delete on public.competitors, public.rate_snapshots to authenticated;
grant select, insert, update on public.ota_tickets to authenticated;
grant select, insert on public.email_suppressions, public.email_outbox, public.email_campaigns to authenticated;
