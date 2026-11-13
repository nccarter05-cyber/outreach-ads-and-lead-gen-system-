# Plan: Resolving the Email Gap

**Status:** open — parked deliberately on 2026-11-13 to finish building the rest of the system.
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
