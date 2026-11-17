# Lead Sourcing Front Door — integration contract

**Status:** stub, written 2026-11-13. The front door itself is an n8n workflow
that lives in n8n, not in this repo. `plan.md` previously linked
`../lead-sourcing-front-door.md`, which resolved outside the repository and was
broken for anyone cloning it; this file replaces that link.

This document records **only the contract this app depends on** — the shape of
the upstream data and the mapping rules the relay applies. It is not a
description of the workflow's internals. If the workflow changes the columns or
niche values below, the relay in
[`kc-outreach/supabase/migrations/0004_lead_pool_relay.sql`](../kc-outreach/supabase/migrations/0004_lead_pool_relay.sql)
breaks silently — new leads simply stop being segmented, or stop arriving.

## Where the boundary is

Lead sourcing is centralized company-wide: one n8n front-door workflow scrapes
multi-source, dedupes globally, and writes into the **`lead_gen` schema** on the
shared kc-backend Supabase project (ref `oseiocamxbymbroboeav`).

This app does not scrape. It owns the **`outreach` schema** and reads `lead_gen`
only through one `after insert` trigger. The fan-out contract into `lead_gen` is
untouched by this app — the relay is additive and the front door is unaware of it.

```
n8n front door ──writes──> lead_gen.businesses ──trigger──> outreach.leads
  (scrapes, dedupes)                            relay_to_outreach
```

## `lead_gen.businesses` — columns the relay reads

Verified against the live schema on 2026-11-13. The relay reads six of the
twenty columns; the rest are the front door's own bookkeeping.

| Column | Type | Used by the relay as |
|---|---|---|
| `id` | uuid | `outreach.leads.pool_business_id` (idempotency key) |
| `name` | text | both `leads.name` and `leads.company`, `coalesce(…, '')` |
| `phone` | text | `leads.phone` |
| `city` | text | `leads.location`, joined `city, state` via `concat_ws` |
| `state` | text | `leads.location` (as above) |
| `niche` | text | segment assignment, falling back to `category` |
| `category` | text | segment assignment fallback when `niche` is null |

Present upstream but **not** read by the relay: `sourcing_id`, `phone_raw`,
`website`, `sub_niche`, `address`, `postal`, `rating`, `review_count`,
`sources`, `first_run_id`, `status`, `created_at`, `updated_at`.

`website`, `rating` and `review_count` are deliberately not pre-seeded into
`lead_enrichments` — Exa enrichment remains the real step (noted in 0004).

**There is no `email` column on `businesses`.** Email lives in a sibling table,
below. This is the structural reason 120 of 122 leads are phone-only; see
[email-enrichment-plan.md](email-enrichment-plan.md).

## Sibling tables (not read by this app today)

- **`lead_gen.enrichments`** — `business_id`, `owner_name`, `owner_email`,
  `owner_linkedin`, `email_source`, `confidence`, `enriched_at`. An upstream
  email slot that already exists and is **empty (0 rows)**. The relay does not
  read it. Any enrichment decision should consider filling this table in the
  front door rather than adding a second enricher inside this app.
- **`lead_gen.business_sources`** — per-source provenance with `raw_payload`
  jsonb, `source_url`, `run_id`, `scraped_at`. Observed `source` values:
  `google_maps`, `yellow_pages`.
- **`lead_gen.call_activity`** — the cold-call app's own log. Out of scope.

## Niche values recognized by `outreach.map_niche_to_segment`

The function regex-matches `coalesce(niche, category)`, case-insensitively, and
returns a segment UUID or `null`. An unmatched niche is **not an error** — the
lead still arrives, with `segment_id` null and no sequence eligibility, which is
why unmatched values are easy to miss.

**Local Home Services** (`a0000000-…-000000000001`):
`hvac`, `plumb`, `roof`, `electric`, `landscap`, `lawn`, `pest`, `garage`,
`auto repair`, `clean`, `pool`, `paint`, `floor`, `fenc`, `pav`, `solar`

**Health & Wellness** (`a0000000-…-000000000002`):
`med spa`, `medspa`, `dent`, `chiro`, `gym`, `fitness`, `salon`, `barber`, `senior`

**Professional & Retail** (`a0000000-…-000000000004`):
`law`, `attorney`, `real estate`, `realtor`, `account`, `restaurant`, `dealer`

Segment `…000000000003` is seeded but has no niche mapping — assignment to it is
manual only.

These are substring patterns, so `auto repair shop` and `roofing contractor`
both match. All 120 businesses currently in the pool carry niche `auto repair`
and map to Local Home Services.

## Known limits of the relay (deliberate, from 0004)

- Pool merges that **UPDATE** an existing business — a second source filling in
  a missing phone — do not propagate to the already-relayed lead. The trigger is
  `after insert` only.
- Relay is idempotent via a unique index on `pool_business_id`; re-running a
  backfill cannot duplicate leads.
- Relayed leads always land as `source='scraped'`, `status='new'`.

## If the front door changes

- **New niche verticals** → add the pattern to `map_niche_to_segment` in a new
  migration, or leads arrive unsegmented.
- **Renamed or dropped column** among the six above → the trigger function
  errors, which will **fail the front door's insert**, since the trigger runs in
  the same transaction. Test pool-schema changes against this relay first.
- **Emails start arriving** → decide whether to extend the relay to read
  `lead_gen.enrichments`, rather than enriching again downstream.
