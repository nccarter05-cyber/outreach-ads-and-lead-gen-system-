-- New lead source for rows relayed from the n8n front-door pool.
-- Applied 2026-07-16 as migration "outreach_0003_scraped_source".
-- (Own migration: a new enum value cannot be used in the transaction that adds it.)

alter type outreach.lead_source add value 'scraped';
