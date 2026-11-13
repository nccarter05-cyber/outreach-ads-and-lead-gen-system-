# Plan: Resolving the Email Gap

**Status:** open — provider choice awaiting Nate's decision as of 2026-11-13.
Step 1 (domain coverage) is **answered**: see *Measured findings* below. The
gate is passed, so the decision is live rather than parked.
**Owner:** Nate
**Blocks:** every email channel (cold email, follow-ups, warm email). Does not block cold calling or social.

---

## The problem, measured

As of 2026-11-13, `outreach.leads` holds:

| | count | email | phone | linkedin | facebook | instagram |
|---|---:|---:|---:|---:|---:|---:|
| `Local Home Services` (scraped) | 120 | **0** | 120 | 0 | 0 | 0 |
| unassigned (manual) | 2 | 2 | 0 | 0 | 0 | 0 |
| **total** | **122** | **2** | 120 | 0 | 0 | 0 |

98% of leads have no email address. The follow-up processor runs hourly and
correctly reports `campaignsProcessed: 0`, because there is nothing it can
send to. The infrastructure is finished and idle; the data is the bottleneck.

The scraped rows came in through the `lead_gen.businesses` relay trigger
(migrations 0003/0004), which carries whatever the n8n front-door workflow
collected. That pipeline is currently producing phone numbers only.

## Why this was always going to happen

Recorded in `plan.md` under Key Technical Constraints: **Exa AI does not return
email addresses.** It is a search and content API, not a contact database. The
enrichment path in `lib/exa.ts` fills in company context, role and bio — useful
for personalising copy, useless for addressing it.

The plan has carried an explicit open decision since Phase 3: *"contact data
must come from Apify extraction or a secondary enricher (Apollo.io / Hunter.io
is an open decision before Phase 3)."* This document is that decision.

## The real constraint: coverage on this niche

The usual comparison (Apollo vs Hunter on price and credits) is the wrong
first question. Both are built for B2B SaaS and corporate prospecting. This
segment is **local home services** — plumbers, roofers, HVAC, landscapers.
Those businesses:

- often have no corporate domain, only a Google Business profile or a
  Facebook page
- where they do have a domain, frequently use a generic inbox
  (`info@`, `office@`, `contact@`) with no named person behind it
- are largely absent from person-level B2B databases, which index job titles
  at companies with employee records

So list price is secondary. **Measured hit rate on our own 120 rows is the
deciding number**, and nobody's marketing page can tell us what it is.

---

## Step 1 — Recover websites first (do this before buying anything)

Email enrichment is overwhelmingly domain-driven: given `joesplumbing.com`,
finding `info@joesplumbing.com` is easy; given only a business name and a
phone number, it is guesswork.

`outreach.leads` has **no `website` column** (confirmed against
`information_schema`), and the Apify Google Maps actor
(`compass/crawler-google-places`) *does* return a `website` field. So the
first move costs nothing but a re-run:

1. Add migration `0007`: `alter table outreach.leads add column website text;`
   Mirror it in `lead_gen.businesses` and extend the relay trigger so new
   rows carry it through.
2. Re-run the Google Maps actor over the same search terms with website
   extraction on, and backfill the existing 120 rows by matching on
   `pool_business_id`.
3. **Measure:** how many of 120 have a usable domain?

That number sets everything downstream:

- **> 60% have domains** → a domain-based enricher (Hunter-style) is the right
  tool, and the job is mostly mechanical from here.
- **30–60%** → split strategy: enrich the domain half, work the rest by phone.
- **< 30%** → email is structurally the wrong channel for this segment. Stop,
  and reallocate to calling and social. This is a real possible outcome and
  should not be treated as failure.

**Do not skip this step.** Buying credits before knowing the domain rate is
how you end up paying for a tool that can't work with the inputs you have.

## Step 2 — Spike both enrichers on the same 50 rows

Once domains exist, take a fixed sample of 50 and run it through both
providers on free or trial credits. Judge on four numbers:

| metric | what it means |
|---|---|
| **hit rate** | % of the 50 that return any address |
| **named-person rate** | % that return a real person vs a generic inbox |
| **confidence/verification** | does the provider mark deliverability, and is it honest |
| **cost per *usable* contact** | total spend ÷ addresses that survive verification — not per credit |

Named-person rate matters more than raw hit rate. `info@` addresses go to a
shared inbox, get the lowest engagement, and are the most likely to be
treated as spam traps. A provider returning 80% generic inboxes is worse than
one returning 40% named owners.

Run both against the **same** 50 rows so the comparison is like-for-like, and
keep the sample file in `docs/` so the result is auditable later.

### Candidates

- **Hunter.io** — domain-first. Give it a domain, get addresses plus a
  confidence score. Cheaper, simpler, and well matched to "I have a website
  and need the office address." Weak on named individuals at tiny businesses.
- **Apollo.io** — person-first, large B2B contact graph, also returns titles
  and LinkedIn URLs (which would simultaneously fix the zero social coverage
  and unblock DM steps). Richer, pricier, and its coverage of two-person
  roofing companies is the open question.
- **Apify contact-details actors** — a third option worth including in the
  spike. Crawl the site and scrape whatever address is published on the
  contact page. No per-contact licensing, already in the stack and paid for,
  and for small local businesses the public contact page is often the *only*
  place the address exists. Frequently beats both databases on this niche.

Check current pricing at decision time rather than trusting figures written
here — these vendors reprice often.

## Step 3 — Implement behind one interface

Whatever wins, keep the call site provider-agnostic so a later swap is one
file, not a refactor:

```
lib/enrich-contacts.ts
  findEmailsForLead(lead) -> { email, confidence, source, isGeneric }[]
```

Shaped to match the existing `lib/exa.ts` and `lib/instantly.ts` conventions.
Notes for the build:

- Write results to `lead_enrichments`, and only promote an address onto
  `leads.email` above a confidence threshold. Keep the raw payload.
- Record `source` per address so bounce rates can be attributed back to the
  provider — that's how the next renewal decision gets made on evidence.
- Check `outreach.suppressions` before promoting; never resurrect a
  suppressed address (`lib/suppressions.ts`).
- Rate-limit and batch. These APIs bill per lookup and usually cap
  concurrency.
- Add a "Find emails" bulk action on `/leads` mirroring the existing Exa
  enrichment UI.

## Step 4 — Protect deliverability before volume

The sending domain is new and has no reputation. Going from 2 sends to 120
overnight on purchased addresses is the fastest way to land in spam
permanently. Before scaling:

- **Verify every address** before first send. Bounces are what destroy sender
  reputation, and purchased lists always contain stale rows.
- **Warm up.** Start at 10–20/day and ramp over 2–3 weeks.
  `SMTP_DAILY_CAP` in `lib/smtp.ts` already enforces a ceiling — use it.
- **Treat generic inboxes as a separate, lower-priority cohort.** Different
  copy, lower volume. Don't mix them into the main sequence.
- Confirm SPF, DKIM and DMARC are published for the sending domain.
- The CAN-SPAM footer and signed unsubscribe link (`lib/compliance.ts`) are
  already wired and non-negotiable on cold mail.

---

## Decision gate

Proceed to Step 2 only if Step 1 yields **> 30% domain coverage**. Below that,
the correct answer is that email is the wrong channel for this segment:
work the 120 phone numbers through `/calls`, and revisit email when a segment
with better data arrives (B2B/LinkedIn-sourced leads would behave completely
differently).

## Open questions

- Should the n8n front-door workflow enrich at ingest, so new leads arrive
  complete, rather than enriching in batches afterwards?
- Is there a second segment with better email economics that should be
  prioritised over fixing this one?
- Does Apollo's LinkedIn-URL coverage justify its price on its own, given it
  would also unblock the DM channel?

## Next action when this is picked up

Write migration `0007` adding `leads.website`, extend the relay trigger, and
re-run the Apify actor with website extraction. Everything else waits on that
one number.

---

## Measured findings (2026-11-13)

Three things were measured against the live database. They change the plan's
cost and sequencing, and they are recorded here before any provider is picked.

### 1. Domain coverage is 68% — the gate is passed

The plan's Step 1 assumed `website` had to be re-scraped from Apify. It does
not: **the front door already collects it.** `lead_gen.businesses.website` is
populated for **82 of 120 businesses (68.3%)**, across **78 distinct hosts**,
of which only 5 are social or aggregator URLs (Facebook, Yelp, `business.site`
and similar) rather than real domains.

That clears the plan's own `> 60%` threshold, whose stated consequence is:
*"a domain-based enricher (Hunter-style) is the right tool, and the job is
mostly mechanical from here."*

What the relay does with that column today: **nothing.** Migration 0004 reads
six columns and `website` is not one of them, which is why `outreach.leads`
looks domain-less. So Step 1 costs no Apify spend and no re-scrape — it is a
migration adding `leads.website`, an extended relay, and a backfill join on
`pool_business_id`. The 38 rows without a website are a phone/social cohort
regardless of which provider wins.

### 2. The upstream pool already has an email slot, and it is empty

`lead_gen.enrichments` exists with exactly the right shape — `business_id`,
`owner_name`, **`owner_email`**, `owner_linkedin`, `email_source`,
`confidence`, `enriched_at` — and holds **0 rows**.

Someone designed for this problem upstream and never filled it. That answers
the plan's first open question (*should the front door enrich at ingest?*) in
the affirmative: the schema is already there, enriching at ingest means every
downstream consumer benefits, and it avoids a second enricher living inside
this app. The relay would then read `enrichments.owner_email` instead of this
app calling a provider at all.

### 3. The 120 leads are all one niche

Every pooled business carries niche `auto repair` and maps to Local Home
Services. Conclusions here generalize to that trade, not to the other three
segments, which have no leads yet.

## Current pricing (checked 2026-11-13)

**Hunter.io** — Free $0 (50 credits/mo), Starter $49/mo or $34/mo annual
(2,000 credits/mo), Growth $149/mo or $104/mo annual (10,000/mo), Scale
$299/mo or $209/mo annual (25,000/mo). One shared credit pool across Domain
Search, Email Finder and Verifier; **1 credit per email found, nothing charged
when a search finds nothing**; verification costs 0.5 credit. Taken from
hunter.io/pricing directly.

**Apollo.io** — Basic $49, Professional $79, Organization $119 per seat/month
billed annually (roughly $65/$99/$149 on monthly billing); Organization is
reported annual-only with a 3-seat minimum. **Apollo's own pricing page no
longer publishes credit allowances or seat minimums** — these figures are
third-party consensus and the credit numbers conflict badly between sources
(one reports a unified pool, others separate export credits, and Capterra
reviewers in January 2026 complain paid plans now grant only ~2,500 credits).
Treat as indicative only; confirm with sales before committing.

**Apify contact-details actors** — pay per use, no subscription. The store has
many: Contact Info Scraper (vdrmota) from **$1.05/1,000 scraped pages**,
Website Contact Scraper (pro100chok) from **$1.00/1,000 results**, Contact
Finder (moorish-dev) from $1.50/1,000, Contact Details Scraper (practicaltools)
**$4.50/1,000 successful results — empty pages not charged**, up to $10/1,000
for others. A "result" means a page, a domain or a dataset item depending on
the actor, so the headline rates are not directly comparable; confirm what each
counts as billable. Several also extract LinkedIn/Facebook/Instagram profile
URLs in the same pass, which is the only candidate that would touch the zero
social coverage.

### What this costs for 82 domains

| option | cost for this list | shape |
|---|---|---|
| Apify contact actor | **well under $1** | pay-per-use, already in the stack |
| Hunter free tier | **$0** for 50, then $34–49/mo | subscription, domain-first |
| Apollo Basic | **~$588/yr** (1 seat, annual) | per-seat subscription, person-first |

## Recommendation (awaiting decision)

**Run the Apify contact-details actor first; use Hunter's free tier as the
measurement control; do not buy Apollo for this segment.**

Reasoning, in the order that matters:

1. **Apollo is the wrong shape for this niche, independent of price.** It is a
   person-first B2B contact graph indexed on job titles at companies with
   employee records. A two-bay auto repair shop has no such record. Paying
   ~$588/yr per seat to discover that is the exact mistake the plan warns
   about. Its LinkedIn coverage is the only real draw, and that is better
   tested later against a segment that actually lives on LinkedIn.
2. **Apify is already in the stack, already paid for, and bills per use.** For
   82 domains the spend is cents, there is no subscription to justify, and for
   a local trade the public contact page is frequently the *only* place an
   address exists at all — which is precisely where a crawler wins and a
   database loses.
3. **Hunter is the right control, at zero cost.** Its free 50 credits cover a
   like-for-like sample, it charges nothing for searches that find nothing, and
   if it beats the crawler on named-person rate then $34/mo annual is an easy
   yes. Keep it as the fallback, not the opening move.
4. **Judge on named-person rate, not hit rate**, as the plan already says. A
   crawler returning `info@` for 80% of shops has not solved the problem; it
   has produced a low-engagement cohort that needs its own copy and volume.

Sequencing, cheapest-first, each step gated on the last:

1. ~~Migration `0007`: `leads.website`, extend the 0004 relay, backfill the 82.~~
   **Written 2026-11-13, not yet applied** — see *Step 1 status* below.
2. Run one Apify contact actor over those 82 domains. Measure hit rate,
   named-person rate, and how many also yield social URLs.
3. Run Hunter's free 50 over the **same** sample. Compare on cost per *usable*
   contact.
4. Decide where it lives: if the winner is a crawler, strongly prefer putting
   it in the n8n front door writing `lead_gen.enrichments`, so every consumer
   gets it, over a second enricher inside this app.
5. Only then `lib/enrich-contacts.ts` as the plan specifies, behind the
   provider-agnostic interface.

The deliverability work in Step 4 is unchanged and still gates volume: 120
sends on newly-purchased addresses from a cold domain is how a sending
reputation dies.


---

## Step 1 status (2026-11-13)

`kc-outreach/supabase/migrations/0007_lead_website.sql` is written and the app
layer is wired for it (`LeadRow.website`, `Lead.website`, `mapLead`, and the
domain shown on the lead detail page; `queries.ts` selects `*`, so nothing else
needed changing). `npm run build` is clean.

**It has not been applied to the database.** Applying it writes to the shared
kc-backend project, which needs Nate's go-ahead. Nothing reads `leads.website`
until it is applied — the column simply isn't there, and the UI block is
conditional, so the app is unaffected either way.

What it does, beyond the three things the sequencing above called for:

- Adds a partial index `leads_enrichable_idx` on `(segment_id) where website is
  not null and email is null` — the exact worklist query step 2 runs.
- Adds an `after update of website` trigger on `lead_gen.businesses` that fills
  `leads.website` **only when it is null**. 0004 deliberately let pool merges
  not propagate; for phone that is tolerable, but a business that gains a
  website on a later multi-source pass would otherwise stay unenrichable
  forever. No merge has happened yet (all 120 rows are single-source with
  `updated_at = created_at`), so this is forward cover, not a fix for observed
  data. It is the one piece not strictly required by step 1 — drop it if the
  front door's merge semantics turn out to make it redundant.

Re-measured against live data before writing: **82 of 120 (68.3%)**, 82
distinct hosts, 4 social/aggregator URLs. Unchanged from the figures above.

Steps 2–5 are unchanged and still wait on the provider decision.
