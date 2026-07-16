-- KC Outreach: segments, leads, enrichment, sequences, campaigns,
-- follow-up state machine, outreach logs, AI copy cache, integrations.
-- Lives in a dedicated "outreach" schema on the shared kc-backend project
-- (ref oseiocamxbymbroboeav), alongside the KC Dashboard's public schema.
-- Applied 2026-07-15 as migration "outreach_0001_schema".

create schema outreach;
set search_path to outreach;

create type channel as enum ('email','linkedin','facebook','instagram','call');
create type lead_source as enum ('google_maps','linkedin','manual');
create type lead_status as enum ('new','enriched','in_sequence','contacted','replied','booked','not_interested');
create type campaign_status as enum ('draft','active','paused','completed');
create type campaign_lead_status as enum ('pending','in_progress','replied','completed','stopped');
create type touch_status as enum ('scheduled','pending_integration','sent','opened','replied','failed','skipped');
create type copy_source as enum ('claude','instantly','static');

create table segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  criteria text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null default '',
  title text not null default '',
  email text,
  phone text,
  linkedin_url text,
  facebook_url text,
  instagram_url text,
  location text not null default '',
  source lead_source not null default 'manual',
  status lead_status not null default 'new',
  segment_id uuid references segments(id) on delete set null,
  created_at timestamptz not null default now()
);
create index leads_segment_idx on leads (segment_id);
create index leads_status_idx on leads (status);
create unique index leads_email_unique on leads (lower(email)) where email is not null;

create table lead_enrichments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads(id) on delete cascade,
  summary text not null default '',
  industry text not null default '',
  company_size text not null default '',
  website text not null default '',
  signals text[] not null default '{}',
  exa_data jsonb,
  enriched_at timestamptz not null default now()
);

create table sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  segment_id uuid references segments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_order int not null,
  delay_days int not null default 0,
  channel channel not null,
  copy_source copy_source not null default 'claude',
  template_prompt text,
  subject_template text,
  body_template text,
  created_at timestamptz not null default now(),
  unique (sequence_id, step_order)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sequence_id uuid not null references sequences(id) on delete restrict,
  status campaign_status not null default 'draft',
  timezone text not null default 'America/New_York',
  send_days text[] not null default '{Mon,Tue,Wed,Thu,Fri}',
  window_start time not null default '09:00',
  window_end time not null default '17:00',
  daily_cap int not null default 25,
  instantly_ids jsonb not null default '{}',
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  completed_at timestamptz
);

create table campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  status campaign_lead_status not null default 'pending',
  current_step_order int not null default 0,
  next_send_at timestamptz,
  last_sent_at timestamptz,
  replied_at timestamptz,
  stopped_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  unique (campaign_id, lead_id)
);
create index campaign_leads_campaign_status_idx on campaign_leads (campaign_id, status);
create index campaign_leads_due_idx on campaign_leads (next_send_at)
  where status in ('pending','in_progress');

create table outreach_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_lead_id uuid references campaign_leads(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  step_id uuid references sequence_steps(id) on delete set null,
  channel channel not null,
  status touch_status not null,
  subject text,
  body text,
  external_id text,
  error text,
  sent_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index outreach_logs_campaign_idx on outreach_logs (campaign_id, created_at desc);
create index outreach_logs_lead_idx on outreach_logs (lead_id);
create index outreach_logs_external_idx on outreach_logs (external_id);

create table ai_copy_cache (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  step_id uuid references sequence_steps(id) on delete cascade,
  channel channel not null,
  subject text,
  body text,
  payload jsonb,
  model text not null default 'claude-sonnet-5',
  generated_at timestamptz not null default now()
);
create unique index ai_copy_step_unique on ai_copy_cache (lead_id, step_id) where step_id is not null;
create unique index ai_copy_channel_unique on ai_copy_cache (lead_id, channel) where step_id is null;

create table integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  api_key text,
  meta jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- RLS on, no policies: all access goes through the server-only service-role
-- client, which bypasses RLS. Policies get written when auth is added.
alter table segments enable row level security;
alter table leads enable row level security;
alter table lead_enrichments enable row level security;
alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table campaigns enable row level security;
alter table campaign_leads enable row level security;
alter table outreach_logs enable row level security;
alter table ai_copy_cache enable row level security;
alter table integrations enable row level security;

-- PostgREST access: expose the schema to the service-role client only.
grant usage on schema outreach to anon, authenticated, service_role;
grant all on all tables in schema outreach to service_role;
alter default privileges in schema outreach grant all on tables to service_role;

-- Also applied (separately, matching the existing cold_call schema pattern):
--   alter role authenticator set pgrst.db_schemas = 'public, graphql_public, cold_call, outreach';
--   notify pgrst, 'reload config';
