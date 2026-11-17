-- Phase 8: organic social posting (Meta + LinkedIn) + landing-page attribution.
--
-- social_accounts: one row per connected Facebook Page / IG Business account /
--   LinkedIn Company Page, holding that account's OAuth token. Tokens are
--   stored like integrations.api_key (plain text behind RLS-with-zero-policies;
--   only the server-only service-role client can read them, and no query ever
--   ships them to the browser).
-- social_posts: one row per post per platform. Each gets a tracking_code that
--   backs its public landing page (/lp/[code]); leads captured there carry
--   source_post_id, which is the funnel attribution.
--
-- Naming: the live schema already has `posts` / `social_jobs` /
-- `platform_settings` from an earlier Playwright DM/posting effort (migrations
-- outreach_0005_social_channels / outreach_0006_social, applied 2026-07-19,
-- never committed here, all post/job tables empty). They are left untouched —
-- the `social_` prefix keeps this phase clear of them.
--
-- platform is text + check rather than an enum so 8.2 can record TikTok rows
-- (docs/ugc-ads-plan.md) without an enum migration.

-- New lead source. Not used anywhere in this transaction, so it is safe to add
-- here (PG12+); 0003 split it out only because it also used the value.
alter type outreach.lead_source add value if not exists 'social';

create table outreach.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook','instagram','linkedin','tiktok')),
  external_id text not null,          -- FB page id / IG user id / LinkedIn org id
  name text not null default '',
  handle text,                        -- IG username / LinkedIn vanity name
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,       -- null = non-expiring (Meta page tokens)
  status text not null default 'active'
    check (status in ('active','expired','error','disconnected')),
  last_error text,
  meta jsonb not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);

create table outreach.social_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references outreach.social_accounts(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram','linkedin','tiktok')),
  status text not null default 'draft'
    check (status in ('draft','scheduled','publishing','published','failed')),
  content text not null default '',
  -- What the post links to: our landing page (attributed), any URL, or nothing.
  link_type text not null default 'landing' check (link_type in ('landing','custom','none')),
  link_url text,
  tracking_code text not null unique
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  landing_headline text not null default '',
  landing_body text not null default '',
  landing_cta text not null default 'Get in touch',
  segment_id uuid references outreach.segments(id) on delete set null,
  scheduled_at timestamptz,
  published_at timestamptz,
  external_post_id text,
  permalink text,
  error text,
  attempts int not null default 0,
  -- Flat platform metrics, refreshed by the social tick.
  impressions int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  clicks int not null default 0,
  metrics_updated_at timestamptz,
  -- First-party funnel counters, bumped by the public landing page.
  landing_views int not null default 0,
  form_submissions int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_posts_due_idx on outreach.social_posts (scheduled_at)
  where status = 'scheduled';
create index social_posts_published_idx on outreach.social_posts (published_at desc)
  where status = 'published';
create index social_posts_account_idx on outreach.social_posts (account_id);

alter table outreach.leads
  add column if not exists source_post_id uuid
    references outreach.social_posts(id) on delete set null;
create index if not exists leads_source_post_idx on outreach.leads (source_post_id)
  where source_post_id is not null;

-- Atomic counter bump for the public landing page (views / form submissions).
-- Views only count once the post is live, so previewing drafts doesn't skew it.
create or replace function outreach.record_landing_event(p_code text, p_kind text)
returns void
language sql
security definer
set search_path = outreach
as $$
  update social_posts
     set landing_views    = landing_views    + case when p_kind = 'view'   then 1 else 0 end,
         form_submissions = form_submissions + case when p_kind = 'submit' then 1 else 0 end
   where tracking_code = p_code
     and (p_kind = 'submit' or status = 'published');
$$;
revoke execute on function outreach.record_landing_event(text, text) from public, anon, authenticated;
grant execute on function outreach.record_landing_event(text, text) to service_role;

alter table outreach.social_accounts enable row level security;
alter table outreach.social_posts enable row level security;
grant all on outreach.social_accounts, outreach.social_posts to service_role;

notify pgrst, 'reload schema';
