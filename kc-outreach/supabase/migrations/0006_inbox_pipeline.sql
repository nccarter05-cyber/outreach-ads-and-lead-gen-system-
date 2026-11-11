-- Phase 9: unified reply inbox + native deal pipeline.
-- messages: every inbound reply / outbound reply, any channel (text, not the
-- touch_channel enum, so landing-page 'web' messages need no enum change).
-- deals: one OPEN deal per lead (partial unique index). deal_events: audit trail.

create type outreach.message_direction as enum ('inbound', 'outbound');
create type outreach.deal_stage as enum ('new_reply','qualified','meeting_booked','proposal','won','lost');

create table outreach.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references outreach.leads(id) on delete cascade,
  campaign_lead_id uuid references outreach.campaign_leads(id) on delete set null,
  channel text not null default 'email',
  direction outreach.message_direction not null,
  subject text not null default '',
  body text not null default '',
  external_id text,
  thread_key text,
  occurred_at timestamptz not null default now(),
  read_at timestamptz,
  classification text,
  ai_draft text,
  created_at timestamptz not null default now()
);
create index messages_lead_idx on outreach.messages (lead_id, occurred_at desc);
create index messages_unread_idx on outreach.messages (occurred_at desc)
  where direction = 'inbound' and read_at is null;
create unique index messages_external_uniq on outreach.messages (external_id)
  where external_id is not null;

create table outreach.deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references outreach.leads(id) on delete cascade,
  stage outreach.deal_stage not null default 'new_reply',
  value numeric(12,2) not null default 0,
  owner_email text,
  next_step text not null default '',
  next_step_at timestamptz,
  lost_reason text,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index deals_one_open_per_lead on outreach.deals (lead_id)
  where stage not in ('won','lost');
create index deals_stage_idx on outreach.deals (stage);

create table outreach.deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references outreach.deals(id) on delete cascade,
  from_stage outreach.deal_stage,
  to_stage outreach.deal_stage not null,
  created_at timestamptz not null default now()
);
create index deal_events_deal_idx on outreach.deal_events (deal_id, created_at);

alter table outreach.messages enable row level security;
alter table outreach.deals enable row level security;
alter table outreach.deal_events enable row level security;
