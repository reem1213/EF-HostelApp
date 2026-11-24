-- HostelPulse schema. Run in the Supabase SQL editor.
-- Every table is protected by row-level security; users only see their own rows.

create table if not exists public.properties (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  beds        int  not null check (beds > 0),
  benchmark   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Actions taken on audit findings. The finding_id is the stable rule key
-- (for example 'laundry-peer' or 'dupe-mailchimp').
create table if not exists public.finding_actions (
  property_id  text not null,
  finding_id   text not null,
  addressed_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  addressed_at timestamptz not null default now(),
  primary key (property_id, finding_id)
);

alter table public.properties      enable row level security;
alter table public.finding_actions enable row level security;

create policy "owners manage their properties"
  on public.properties for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "users manage their finding actions"
  on public.finding_actions for all
  to authenticated
  using (addressed_by = auth.uid())
  with check (addressed_by = auth.uid());
