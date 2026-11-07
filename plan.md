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
  - n8n schedule trigger calls `/api/cron/outreach` hourly, authenticated with `Authorization: Bearer $CRON_SECRET`
  - Query: sequence_steps where delay_days reached → trigger outreach for pending campaign_leads

### Phase 7: Analytics & Dashboard Home *(depends on Phase 6)*
- Campaign overview: leads count, steps sent, open rate (email), reply rate
- Per-lead outreach timeline (all touches in chronological order)
- Channel breakdown: emails sent vs DMs sent per channel
- Feed-ready data structure for future KC Dashboard API connection

### Phase 8: Organic Social Posting *(Meta + LinkedIn — DM automation on hold in favor of this)*
> The "ads" half of this system's name was never actually scoped until now. This phase covers **organic** posting only (no spend/targeting) — paid ad campaigns are a separate, later phase. Posts serve two purposes: feed new leads into the funnel, and give a standalone view of post performance.

- **Schema** (`outreach` schema, new migration): `social_accounts` (one row per connected Facebook Page / IG Business account / LinkedIn Company Page — platform, external id, OAuth tokens, status); `social_posts` (platform, status, content, link, `tracking_code`, landing copy, target `segment_id`, schedule/publish timestamps, external post id, flat metric columns — impressions/likes/comments/shares/clicks); `leads` gains `source_post_id` and a new `'social'` source value.
- **Platform wrappers** — `/lib/meta.ts` (Graph API: publish to FB Page + IG Business two-step publish, fetch insights) and `/lib/linkedin.ts` (UGC Posts API, fetch analytics), both built the same shape as `/lib/instantly.ts` (`isConfigured()` / degrade gracefully rather than error).
  - **LinkedIn caveat:** organic posting requires LinkedIn's Community Management API, which is partner-approval-gated (not self-serve like Meta's developer app, no guaranteed timeline). Decision: build LinkedIn through the identical code path as Meta, but it stays inactive (posts save as drafts, never auto-publish) until real API access is confirmed and connected — mirrors how Instantly sends degrade to `pending_integration` when unconfigured today.
- **OAuth connect** — `/app/api/oauth/meta/callback/route.ts`, `/app/api/oauth/linkedin/callback/route.ts`; new env vars `META_APP_ID`, `META_APP_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
- **Copy generation** — `generateSocialCopy()` added to `/lib/claude.ts`, reusing the King Circle AI system prompt with per-platform tone/length rules.
- **Scheduler** — `/lib/social-processor.ts` (`runSocialPublishTick()`) publishes due scheduled posts and refreshes metrics for recently published ones; `/app/api/cron/social/route.ts` mirrors the existing outreach cron route (same `CRON_SECRET` bearer check, driven by a second n8n schedule node); manual "Publish due posts" button mirrors "Run scheduler."
- **Funnel attribution** — public landing route `/app/lp/[code]/page.tsx` (per-post `tracking_code`, no dashboard chrome) with a lead-capture form; submitting inserts into `leads` with `source='social'` and `source_post_id` set, so captured leads flow into the existing Leads list/segments/sequences unchanged.
- **UI** — `/app/(dashboard)/social/page.tsx` (composer + posts table, same `page.tsx`/`-client.tsx`/server-action pattern as Sequences/Campaigns) and a standalone `/app/(dashboard)/social/performance/page.tsx` analytics page (same layout pattern as the Command Center: stat row + channel breakdown, no new charting library).
- **v1 scope cut:** no image/media upload (no Storage pipeline exists yet, and LinkedIn's image flow needs a separate asset-registration step) — text + link posts only; image support is the Phase 8.1 fast-follow below.

### Phase 8.1: Social Post Images *(fast-follow, depends on Phase 8)*
- **Storage** — Supabase Storage bucket `social-media`, public read (Meta fetches media by public URL; IG requires `image_url`). Composer uploads via a signed upload URL issued by a server action.
- **Schema** — `social_post_media` (post_id, storage_path, public_url, mime, width, height, sort_order).
- **Validation** — JPEG/PNG, ≤8MB, IG aspect ratio 4:5 – 1.91:1; reject in the composer before save.
- **`/lib/meta.ts`** — Facebook: `/{page}/photos` with the image URL; Instagram: image container → publish (same two-step flow as text). Carousel deferred.
- **`/lib/linkedin.ts`** — `registerUpload` → binary upload → asset URN on the post; stays gated with the rest of LinkedIn.

### Phase 9: Reply Inbox + CRM Pipeline *(depends on Phase 6; Phase 8 landing pages feed it)*
> Today the Instantly webhook only flips statuses to `replied` — reply text is never stored and nothing tracks what happens after a reply. This phase adds a unified inbox and a native deal pipeline (no HubSpot — kept in the `outreach` schema so agents can read/write it directly).

- **Schema** (`outreach` schema, new migration):
  - `messages` — id, lead_id, campaign_lead_id, channel, direction (`inbound`|`outbound`), subject, body, external_id, thread_key, received_at/sent_at, read_at, classification, ai_draft
  - `deals` — id, lead_id (one open deal per lead), stage enum (`new_reply`|`qualified`|`meeting_booked`|`proposal`|`won`|`lost`), value, owner_email, next_step, next_step_at, lost_reason, stage_changed_at
  - `deal_events` — stage-change audit trail
  - `suppressions` — email/domain, reason, created_at; checked before every send (processor + agents)
- **Ingest** — `reply_received` in `/app/api/webhooks/instantly/route.ts` also inserts an inbound `messages` row with the reply body; Phase 8 landing-page submissions create inbound `messages` with channel `web`.
- **Reply out** — `sendReply()` in `/lib/instantly.ts` (Instantly v2 reply endpoint), same `isConfigured()` / `pending_integration` degrade pattern.
- **Status sync** — first inbound reply auto-creates a deal in `new_reply`; `meeting_booked` → lead `booked`; `lost` → lead `not_interested`.
- **UI** — `/app/(dashboard)/inbox/` (thread list with unread/hot filters, thread view, reply composer with "AI draft" reusing the `/lib/claude.ts` system prompt) and `/app/(dashboard)/pipeline/` (Kanban by stage + deal sheet). Same `page.tsx`/`-client.tsx`/server-action pattern; both added to the sidebar. Command Center gains pipeline value + meetings booked from `deals`.

### Phase 10: GTM Agents *(depends on Phase 9)*
> Autonomous agents that run the GTM workflow end to end — prospect research, personalized outreach, reply qualification/routing, and campaign analysis — as 24/7 digital workers coordinated by an orchestrator. They **start approve-first**: agents research, draft, and qualify on their own, but outbound actions wait in an approval queue until autonomy is raised per agent.

- **Orchestrator** — deterministic code, not an LLM: `/lib/agents/orchestrator.ts` `runAgentTick()`, driven by `/app/api/cron/agents/route.ts` (same `CRON_SECRET` bearer check as the outreach cron, a third n8n schedule node). Each tick drains work queues — new leads needing research, scored leads needing outreach, unprocessed inbound messages, weekly analysis — and enforces each agent's enabled flag, autonomy level, daily caps, and token budget. The Instantly webhook also triggers the Qualification agent immediately rather than waiting for the tick.
- **Agent runtime** — each agent in `/lib/agents/*.ts` is a Claude tool-use loop (Anthropic SDK) over narrow tools that wrap existing code: `enrichLead` (`/lib/exa.ts`), `generateEmailCopy` / `generateCallScript` (`/lib/claude.ts`), `addLeadToCampaign` (`/app/actions/campaigns.ts`), `sendReply`, deal-stage mutations.
- **Schema** — `agents` (key, enabled, autonomy `suggest`|`approve`|`auto` — default `approve`, config jsonb, daily caps); `agent_runs` (agent, trigger, status, input/output, tokens, cost, timestamps); `agent_actions` (run_id, type, payload, status `proposed`|`approved`|`rejected`|`executed`|`failed`, reviewed_at, executed_at — `proposed` rows are the approval queue); `agent_reports`; `leads` gains `fit_score`, `intent_signals` (jsonb), `priority`.
- **Agents:**
  1. **Research / Prospecting** — enriches new leads, detects buying signals (hiring, reviews, running ads, tech stack, recent news), scores fit against the segment playbook, re-segments if needed. Optionally proposes new scrape queries to the n8n Lead Sourcing Front Door via webhook.
  2. **Outreach / Personalization** — for leads above the score threshold: picks sequence + campaign, pre-generates per-step copy into `ai_copy_cache`, proposes enrollment. Actual sends stay with `runOutreachTick()`.
  3. **Qualification & Routing** — on every inbound message: classifies (interested / question / objection / not now / OOO / wrong person / unsubscribe), scores qualification, drafts a reply, creates/moves the deal. **Hot leads** are routed to: the inbox (flagged hot) + pipeline stage, an **email alert** (n8n webhook `N8N_NOTIFY_WEBHOOK_URL` — no new email vendor), and the **top of the Call List** with a fresh call script. Unsubscribe (stop sequences + add to `suppressions`) and OOO (reschedule next step) always auto-execute, even in approve mode.
  4. **Analyst / Optimizer** — weekly: reads `outreach_logs`, `deals`, and social metrics; writes a report with a stage-weighted pipeline forecast; proposes changes (pause a weak step, A/B a copy variant, shift a send window).
- **UI** — `/app/(dashboard)/agents/`: agent cards (enable, autonomy, caps, last run), **approval queue** (approve / edit-then-approve / reject, bulk actions), run log with token cost, reports tab.
- **Guardrails** — global kill switch; daily token/cost budget; agent caps layered under existing campaign send caps; every action logged; suppression list checked before any send; autonomy raised one agent at a time.
- **Build order** — Qualification first (needs Phase 9), then Research, Outreach, Analyst.

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
| `/lib/meta.ts` | Meta Graph API — publish + insights (Facebook/Instagram) |
| `/lib/linkedin.ts` | LinkedIn UGC Posts API — publish + analytics (gated on partner approval) |
| `/app/api/oauth/meta/callback/route.ts` | Meta OAuth token exchange |
| `/app/api/oauth/linkedin/callback/route.ts` | LinkedIn OAuth token exchange |
| `/lib/social-processor.ts` | Social post scheduler tick |
| `/app/api/cron/social/route.ts` | Social post scheduler cron |
| `/app/(dashboard)/social/page.tsx` | Post composer + posts table |
| `/app/(dashboard)/social/performance/page.tsx` | Standalone post-performance analytics |
| `/app/lp/[code]/page.tsx` | Public lead-capture landing page per post |
| `/app/(dashboard)/inbox/page.tsx` | Unified reply inbox + AI-drafted replies |
| `/app/(dashboard)/pipeline/page.tsx` | Deal pipeline Kanban |
| `/app/(dashboard)/agents/page.tsx` | Agent controls, approval queue, run log, reports |
| `/lib/agents/orchestrator.ts` | `runAgentTick()` — work queues, caps, autonomy enforcement |
| `/lib/agents/research.ts` | Research / Prospecting agent |
| `/lib/agents/outreach.ts` | Outreach / Personalization agent |
| `/lib/agents/qualify.ts` | Qualification & Routing agent |
| `/lib/agents/analyst.ts` | Analyst / Optimizer agent |
| `/app/api/cron/agents/route.ts` | Agent orchestrator cron (n8n-driven) |

---

## Verification Steps
1. Apify Google Maps run returns businesses with phone/email in `leads` table
2. Exa AI enrichment adds company context to lead records
3. Claude generates distinct personalized copy for each channel per lead
4. Sequence builder saves steps, delays, and channel assignments correctly
5. Instantly.ai email send triggers and logs in `outreach_logs`
6. Playwright DM runner navigates to profile and sends message (test in staging with real account)
7. n8n hourly trigger reaches `/api/cron/outreach`, authenticates, and processes due steps
8. Analytics page reflects accurate counts from `outreach_logs`
9. Meta OAuth connects a real Page/IG account and `runSocialPublishTick()` publishes a real post, storing `external_post_id`
10. LinkedIn posts save as drafts (never auto-publish) until real API access is connected — verify no errors when unconfigured
11. Submitting `/app/lp/[code]` creates a `leads` row with `source='social'` and correct `source_post_id`, visible in the Leads list and the social performance page's attribution count
12. An image post publishes to a real FB Page and IG account from the `social-media` bucket's public URL
13. An Instantly reply lands in `/inbox` with its body text, auto-creates a `new_reply` deal, and a reply sent from the inbox logs an outbound `messages` row
14. Moving a deal to `meeting_booked` sets the lead to `booked`; `lost` sets `not_interested`
15. In `approve` mode, an agent's outbound action sits in the approval queue as `proposed` and does not execute until approved
16. An "unsubscribe" reply auto-stops all sequences and adds a `suppressions` row, and the processor skips that contact afterward
17. A hot reply triggers the n8n email alert, moves the deal, and puts the lead at the top of the Call List with a fresh script
18. The kill switch and daily token budget halt `runAgentTick()` cleanly

---

## Scope Boundaries

| In Scope | Out of Scope (Deferred) |
|---|---|
| Lead scraping (Apify + Exa AI) | Cold calling app (Lovable) integration |
| Lead enrichment | KC Dashboard pipeline connection |
| Claude copy generation | SaaS / multi-tenant features |
| Visual sequence builder | Mobile app |
| Email outreach (Instantly.ai) | Paid social ads (spend/targeting) — later phase |
| Organic social posting (Meta + LinkedIn), incl. images | HubSpot / external CRM sync |
| Analytics dashboard | |
| Reply inbox + native CRM pipeline | |
| GTM agents (research, outreach, qualification, analyst) | |

DM outreach (Playwright automation) is on hold — deprioritized in favor of Phase 8 (organic social posting) per current direction; still in-scope long-term, just not being built next.

### Locked Decisions
- Email provider: **Instantly.ai**
- Scraping: Apify primary, Exa AI secondary, Playwright custom as-needed
- Phantombuster: demoted — too risky for DM automation; optional future consideration only
- DM automation: Playwright server-side, using stored session cookies (ToS risk acknowledged) — **on hold**, resumes after Phase 8
- Scheduling: **n8n schedule trigger** hitting `/api/cron/outreach` hourly with a `CRON_SECRET` bearer token — not Vercel Cron (Hobby is daily-only and fails deployment on finer schedules)
- Social posting: Meta built first (self-serve developer app); LinkedIn wired through the identical code path but gated inactive until Community Management API access is confirmed; images added in Phase 8.1 (not v1)
- CRM: **native** pipeline in the `outreach` schema — no HubSpot
- GTM agents: **approve-first** by default, autonomy raised per agent; orchestrator is deterministic code, not an LLM; hot-lead alerts go through an n8n webhook (no new email vendor)
- Build order after Phase 8: **8.1 → 9 → 10**; DM automation stays on hold

---

## Further Considerations

1. **Email coverage gap** — Exa AI doesn't return emails directly. Apify actors sometimes extract them from public pages. If coverage is low, consider adding **Apollo.io** or **Hunter.io** as a secondary email enricher. Worth deciding before Phase 3.

2. **Playwright DM reliability** — Browser automation for cold DMs is fragile (CAPTCHAs, UI changes, account flags per channel). Each channel needs separate session management. Budget for ongoing maintenance.

3. **Scheduling frequency** — ~~open~~ **decided: n8n drives it.** Vercel Cron on Hobby is limited to one run per day and *fails deployment* on any finer expression, but campaign send windows need hourly ticks. Since n8n already runs the lead front door, a schedule node there calls `/api/cron/outreach` hourly with `Authorization: Bearer $CRON_SECRET`. No `vercel.json` cron block exists. Supabase pg_cron and Inngest are no longer needed.

4. **LinkedIn API access is unconfirmed** — as of starting Phase 8, it's unknown whether King Circle AI has (or can get) LinkedIn Community Management API access for organic posting; unlike Meta this isn't a self-serve developer-app process, it requires LinkedIn's partner approval with no guaranteed timeline. Needs to be checked/applied for early in Phase 8 — Meta posting can ship and be used independently in the meantime.
