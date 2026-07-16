-- Relay: every business the n8n front door inserts into lead_gen.businesses
-- is instantly copied into outreach.leads, with niche -> segment auto-assign.
-- The n8n contract (fan-out into lead_gen) is untouched.
-- Applied 2026-07-16 as migration "outreach_0004_lead_pool_relay".
--
-- Known limits (deliberate): pool merges that UPDATE an existing business
-- (e.g. phone filled by a second source) don't propagate to the relayed lead;
-- website/rating are not pre-seeded into lead_enrichments (Exa enrichment
-- remains the real step).

alter table outreach.leads
  add column pool_business_id uuid references lead_gen.businesses(id) on delete set null;
create unique index leads_pool_business_uniq
  on outreach.leads (pool_business_id) where pool_business_id is not null;

create or replace function outreach.map_niche_to_segment(p_niche text)
returns uuid
language sql
immutable
as $$
  select case
    when p_niche is null then null
    -- Local Home Services
    when p_niche ~* '(hvac|plumb|roof|electric|landscap|lawn|pest|garage|auto repair|clean|pool|paint|floor|fenc|pav|solar)'
      then 'a0000000-0000-4000-8000-000000000001'::uuid
    -- Health & Wellness
    when p_niche ~* '(med spa|medspa|dent|chiro|gym|fitness|salon|barber|senior)'
      then 'a0000000-0000-4000-8000-000000000002'::uuid
    -- Professional & Retail
    when p_niche ~* '(law|attorney|real estate|realtor|account|restaurant|dealer)'
      then 'a0000000-0000-4000-8000-000000000004'::uuid
    else null
  end
$$;

create or replace function outreach.relay_pool_business()
returns trigger
language plpgsql
security definer
set search_path = outreach, lead_gen
as $$
begin
  insert into outreach.leads (name, company, location, phone, source, status, segment_id, pool_business_id)
  values (
    coalesce(new.name, ''),
    coalesce(new.name, ''),
    concat_ws(', ', nullif(new.city, ''), nullif(new.state, '')),
    new.phone,
    'scraped',
    'new',
    outreach.map_niche_to_segment(coalesce(new.niche, new.category)),
    new.id
  )
  on conflict (pool_business_id) where pool_business_id is not null do nothing;
  return new;
end;
$$;

create trigger relay_to_outreach
  after insert on lead_gen.businesses
  for each row execute function outreach.relay_pool_business();

-- Backfill any pool rows that predate the trigger.
insert into outreach.leads (name, company, location, phone, source, status, segment_id, pool_business_id)
select
  coalesce(b.name, ''),
  coalesce(b.name, ''),
  concat_ws(', ', nullif(b.city, ''), nullif(b.state, '')),
  b.phone,
  'scraped',
  'new',
  outreach.map_niche_to_segment(coalesce(b.niche, b.category)),
  b.id
from lead_gen.businesses b
where not exists (
  select 1 from outreach.leads l where l.pool_business_id = b.id
);
