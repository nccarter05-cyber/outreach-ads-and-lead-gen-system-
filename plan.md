# Plan: King Circle AI — Outreach & Lead Generation System

## TL;DR
Build a web dashboard (Next.js + Supabase) that scrapes leads from LinkedIn and Google Maps via Apify, enriches them via Exa AI, generates personalized outreach copy via Claude API, and executes multi-step sequences across email (Instantly.ai) and DM channels (LinkedIn/Facebook/Instagram via Playwright automation). Internal use only. Cold calling app (Lovable) and KC dashboard integration deferred to after build.

---

## Key Technical Constraints (from research)
- **Exa AI**: Good for lead discovery & research but does NOT directly return emails — need Apify actor email extraction or secondary enrichment for contact data
- **Instagram/Facebook DMs**: Official APIs do NOT support cold outreach — must use Playwright browser automation (ToS risk, acknowledged)
- **LinkedIn DMs**: Phantombuster is high ban-risk; use Playwright automation instead
- **Phantombuster**: Demoted to optional/light scraping only due to account ban risk
- **Playwright automation**: Must run server-side (Node.js), NOT in browser or Supabase Edge Functions — use Next.js API routes or a dedicated Node service
- **Apify runs**: Async, can take minutes to hours — trigger run → poll or webhook for results

---

## Architecture

```
Next.js Web Dashboard (Vercel)
├── Lead Generation     → Apify (Google Maps + LinkedIn actors)
├── Lead Enrichment     → Exa AI semantic search
├── AI Copy Generator   → Claude API (email, 3x DM channels, call script)
├── Sequence Builder    → Visual step editor (channel + delay + template)
└── Outreach Engine
    ├── Email           → Instantly.ai API
    ├── LinkedIn DM     → Playwright server automation
    ├── Facebook DM     → Playwright server automation
    └── Instagram DM    → Playwright server automation

Supabase (Postgres + Auth + Storage)
├── leads
├── lead_enrichments
├── campaigns
├── sequences + sequence_steps
├── outreach_logs
└── integrations (API keys, session tokens)
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `leads` | Core lead data (name, company, title, email, phone, social URLs, source) |
| `lead_enrichments` | Exa AI enrichment payload per lead |
| `campaigns` | Named campaigns, each tied to a sequence + lead list |
| `campaign_leads` | Junction: which leads are in which campaign + status |
| `sequences` | Sequence templates |
| `sequence_steps` | Steps (order, delay_days, channel, prompt) |
| `outreach_logs` | Every touch: channel, status, sent_at, Claude copy used |
| `ai_copy_cache` | Claude-generated copy per lead per channel |
| `integrations` | Encrypted API keys and session cookies per channel |

### Field Details
- `leads` — id, name, company, title, email, phone, linkedin_url, facebook_url, instagram_url, source, status, created_at
- `lead_enrichments` — lead_id, exa_data (jsonb), enriched_at
- `campaigns` — id, name, sequence_id, status, created_at
- `campaign_leads` — campaign_id, lead_id, status, started_at, completed_at
- `sequences` — id, name, description, created_at
- `sequence_steps` — id, sequence_id, step_order, delay_days, channel (email|linkedin|facebook|instagram), template_prompt, created_at
- `outreach_logs` — id, campaign_lead_id, step_id, channel, status, sent_at, response_at, generated_copy (text)
- `ai_copy_cache` — lead_id, step_id, channel, copy (text), generated_at
- `integrations` — name, api_key (encrypted), session_cookie (encrypted), meta (jsonb)

---

## Phases

### Phase 1: Foundation
- Next.js project init (App Router, TypeScript, Tailwind)
- Supabase project + schema migration
- Supabase Auth (email/password for internal team)
- Base layout: sidebar nav (Leads, Campaigns, Sequences, Outreach, Settings)
- Vercel project setup

### Phase 2: Lead Generation
> **Superseded by the [Lead Sourcing Front Door](../lead-sourcing-front-door.md).** Lead sourcing is now centralized company-wide in one n8n front-door workflow that scrapes multi-source, dedupes globally, and fans the outreach-bound leads into this system's `lead_gen` schema. The Apify-wrapper-in-the-app approach below is retained only as historical context.

- Apify API wrapper service (`/lib/apify.ts`)
  - Google Maps actor: `compass/crawler-google-places` — input: query string, location
  - LinkedIn actor: `harvestapi/linkedin-profile-search` — input: job title, company, location
- Lead search UI: query builder form, run scrape, poll for results
- Webhook or polling endpoint to receive Apify dataset output
- Import results into `leads` table (deduplicate by email or LinkedIn URL)
- Leads list view: filterable/sortable table

### Phase 3: Lead Enrichment *(can run parallel with Phase 2)*
- Exa AI API wrapper (`/lib/exa.ts`)
  - Enrich per lead: search by person name + company → extract company info, role, bio, social links
  - Use `/search` with structured output schema
- Batch enrichment UI: select leads → enrich all
- Store results in `lead_enrichments`, update `leads` with any new contact data found
- Enrichment status indicator per lead

### Phase 4: AI Copy Generation *(can run parallel with Phases 2–3)*
- Claude API wrapper (`/lib/claude.ts`) using Anthropic SDK
- Prompt templates per channel:
  - Email: subject line + body (personalized to lead's role/company)
  - LinkedIn DM: short, conversational opener
  - Facebook DM: casual, benefit-focused
  - Instagram DM: very short, curiosity hook
  - Call script: opener, value prop, questions, close
- Generate on-demand per lead from lead detail view
- Bulk generation: generate copy for all leads in a campaign at once
- Cache in `ai_copy_cache`

### Phase 5: Sequence Builder *(can run parallel with Phases 2–4)*
- Visual sequence builder UI
  - List of steps, each with: channel selector, delay (days), message template/prompt override
  - Add/remove/reorder steps
- Sequence CRUD (create, save, duplicate, delete)
- Campaign creation: name campaign, pick sequence, select lead list

### Phase 6: Outreach Execution Engine *(depends on Phases 3, 4, 5)*
- **Email (Instantly.ai)**:
  - Add leads to Instantly campaign via API
  - Sync sequence steps to Instantly sequence
  - Webhook/poll for open/reply events → update `outreach_logs`
- **LinkedIn/Facebook/Instagram DMs (Playwright)**:
  - Server-side Playwright runner in Next.js API route or dedicated Node service
  - Auth: session cookie per channel stored in `integrations` table (encrypted)
  - Per step: load channel, navigate to lead profile, send pre-generated Claude copy
  - Rate limiting: human-like delays between sends (configurable)
  - Log result (success/fail) to `outreach_logs`
- **Outreach Scheduler**:
  - Vercel Cron Job (or Supabase pg_cron) to process due sequence steps daily
  - Query: sequence_steps where delay_days reached → trigger outreach for pending campaign_leads

### Phase 7: Analytics & Dashboard Home *(depends on Phase 6)*
- Campaign overview: leads count, steps sent, open rate (email), reply rate
- Per-lead outreach timeline (all touches in chronological order)
- Channel breakdown: emails sent vs DMs sent per channel
- Feed-ready data structure for future KC Dashboard API connection

---

## Key Files to Create

| File | Purpose |
|---|---|
| `/app/(dashboard)/leads/page.tsx` | Leads table |
| `/app/(dashboard)/leads/[id]/page.tsx` | Lead detail + copy gen + outreach history |
| `/app/(dashboard)/campaigns/page.tsx` | Campaigns list |
| `/app/(dashboard)/sequences/page.tsx` | Sequence builder |
| `/app/(dashboard)/analytics/page.tsx` | Metrics dashboard |
| `/lib/apify.ts` | Apify actor runner + result poller |
| `/lib/exa.ts` | Exa AI search + enrichment |
| `/lib/claude.ts` | Claude API copy generation |
| `/lib/instantly.ts` | Instantly.ai campaign + lead API |
| `/lib/playwright-runner.ts` | Server-side DM automation (3 channels) |
| `/app/api/webhooks/apify/route.ts` | Receive Apify dataset results |
| `/app/api/cron/outreach/route.ts` | Sequence step scheduler |
| `/supabase/migrations/` | All schema migrations |

---

## Verification Steps
1. Apify Google Maps run returns businesses with phone/email in `leads` table
2. Exa AI enrichment adds company context to lead records
3. Claude generates distinct personalized copy for each channel per lead
4. Sequence builder saves steps, delays, and channel assignments correctly
5. Instantly.ai email send triggers and logs in `outreach_logs`
6. Playwright DM runner navigates to profile and sends message (test in staging with real account)
7. Cron job fires on schedule and processes due steps
8. Analytics page reflects accurate counts from `outreach_logs`

---

## Scope Boundaries

| In Scope | Out of Scope (Deferred) |
|---|---|
| Lead scraping (Apify + Exa AI) | Cold calling app (Lovable) integration |
| Lead enrichment | KC Dashboard pipeline connection |
| Claude copy generation | SaaS / multi-tenant features |
| Visual sequence builder | Mobile app |
| Email outreach (Instantly.ai) | |
| DM outreach (Playwright automation) | |
| Analytics dashboard | |

### Locked Decisions
- Email provider: **Instantly.ai**
- Scraping: Apify primary, Exa AI secondary, Playwright custom as-needed
- Phantombuster: demoted — too risky for DM automation; optional future consideration only
- DM automation: Playwright server-side, using stored session cookies (ToS risk acknowledged)

---

## Further Considerations

1. **Email coverage gap** — Exa AI doesn't return emails directly. Apify actors sometimes extract them from public pages. If coverage is low, consider adding **Apollo.io** or **Hunter.io** as a secondary email enricher. Worth deciding before Phase 3.

2. **Playwright DM reliability** — Browser automation for cold DMs is fragile (CAPTCHAs, UI changes, account flags per channel). Each channel needs separate session management. Budget for ongoing maintenance.

3. **Scheduling frequency** — Vercel Cron free tier: 1 job/day; Pro: 60/day. If higher frequency is needed (hour-level precision), use **Supabase pg_cron** or **Inngest** for event-driven job queuing. Worth locking in before Phase 6.
