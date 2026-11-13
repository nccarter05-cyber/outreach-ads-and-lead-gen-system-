-- Relay the pool's `website` into outreach.leads.
--
-- Why: every email-enrichment provider under consideration (Apify contact
-- actors, Hunter) is domain-first, so a domain per lead is the one input they
-- all need. docs/email-enrichment-plan.md measured that the front door ALREADY
-- collects it -- lead_gen.businesses.website is populated for 82 of 120
-- businesses (68.3%), 82 distinct hosts, only 4 social/aggregator URLs -- and
-- that migration 0004's relay reads six columns of which `website` is not one.
-- That is the only reason outreach.leads looks domain-less. This migration is
-- step 1 of that plan's sequence: no provider, no spend, no re-scrape.
--
-- Note this is distinct from lead_enrichments.website, which is what Exa
-- *inferred* about a company. This column is what the scrape actually found.

alter table outreach.leads
  add column if not exists website text;

-- Worklist index for the enricher: "has a domain, still has no email".
-- This is the exact query step 2 of the plan runs over the 82.
create index if not exists leads_enrichable_idx
  on outreach.leads (segment_id)
  where website is not null and email is null;

-- Relay, now carrying website. Unchanged from 0004 apart from that column.
create or replace function outreach.relay_pool_business()
returns trigger
language plpgsql
security definer
set search_path = outreach, lead_gen
as $$
begin
  insert into outreach.leads (name, company, location, phone, website, source, status, segment_id, pool_business_id)
  values (
    coalesce(new.name, ''),
    coalesce(new.name, ''),
    concat_ws(', ', nullif(new.city, ''), nullif(new.state, '')),
    new.phone,
    nullif(btrim(new.website), ''),
    'scraped',
    'new',
    outreach.map_niche_to_segment(coalesce(new.niche, new.category)),
    new.id
  )
  on conflict (pool_business_id) where pool_business_id is not null do nothing;
  return new;
end;
$$;

-- 0004 documented a deliberate limit: pool merges that UPDATE an existing
-- business never reach the relayed lead. For phone/rating that is tolerable.
-- For website it is not -- the front door's job is multi-source dedupe, so a
-- business first seen without a website can gain one on a later pass, and the
-- lead would stay unenrichable forever. This propagates that one column only,
-- and only into a NULL, so it can never clobber a value already on the lead.
-- (No merge has actually happened yet: all 120 rows are single-source with
-- updated_at = created_at. This is forward cover, not a fix for observed data.)
create or replace function outreach.relay_pool_business_website()
returns trigger
language plpgsql
security definer
set search_path = outreach, lead_gen
as $$
begin
  if nullif(btrim(new.website), '') is not null
     and new.website is distinct from old.website then
    update outreach.leads
       set website = nullif(btrim(new.website), '')
     where pool_business_id = new.id
       and website is null;
  end if;
  return new;
end;
$$;

drop trigger if exists relay_website_to_outreach on lead_gen.businesses;
create trigger relay_website_to_outreach
  after update of website on lead_gen.businesses
  for each row execute function outreach.relay_pool_business_website();

-- Backfill the leads already relayed by 0004.
update outreach.leads l
   set website = nullif(btrim(b.website), '')
  from lead_gen.businesses b
 where l.pool_business_id = b.id
   and l.website is null
   and nullif(btrim(b.website), '') is not null;
