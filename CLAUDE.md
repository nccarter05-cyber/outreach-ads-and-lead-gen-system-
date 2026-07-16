# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Backend built (email + calls), database live.** The app lives in `kc-outreach/` (Next.js 16 App Router + Tailwind v4 + shadcn/ui v4, dark-only black/gold theme). The mock data layer is gone — all pages read Supabase through `lib/queries.ts` (service-role client in `lib/supabase.ts`, RLS on with zero policies) and mutate via server actions in `app/actions/`. The database is the **`outreach` schema on the shared kc-backend Supabase project** (ref `oseiocamxbymbroboeav` — same project as the KC Dashboard, whose tables live in `public`; don't touch those). Both migrations from `kc-outreach/supabase/migrations/` are applied (0001 schema, 0002 seed: 4 segments + 3 sequences), the schema is exposed to PostgREST via `pgrst.db_schemas` on the `authenticator` role (same pattern as the existing `cold_call` schema), and the supabase-js client pins `db: { schema: "outreach" }`. `.env.local` has the URL and kc-backend's service-role key — the app is fully connected. Leads arrive automatically: an `after insert` trigger on `lead_gen.businesses` (the pool the n8n front-door workflow fans out to) relays every new business into `outreach.leads` with source `scraped` and niche→segment auto-assignment (`outreach.map_niche_to_segment`); relay is idempotent via `leads.pool_business_id` (migrations 0003/0004).

Working once the DB exists: segment/sequence/step CRUD (per-step `copy_source`: claude | instantly | static), campaign builder with schedule + draft/launch/pause, Exa enrichment + Claude call scripts/copy (`lib/exa.ts`, `lib/claude.ts` — model `claude-sonnet-5`), follow-up processor (`lib/processor.ts`, hourly Vercel cron at `/api/cron/outreach` + "Run scheduler" button), Instantly.ai integration (`lib/instantly.ts`, key-ready: sends log as `pending_integration` until `INSTANTLY_API_KEY` is set) and its webhook at `/api/webhooks/instantly`. Social DM automation (Playwright) is the next phase — DM steps are logged `skipped` by the processor. [plan.md](plan.md) remains the source of truth for scope and architecture.

## Commands

All run from `kc-outreach/`:

- `npm run dev` — dev server
- `npm run build` — production build (use to verify changes)
- `npm run lint` — eslint
- `npx shadcn@latest add <component>` — add UI components

## Codebase Notes

- **Next.js 16 differs from training data** — read `kc-outreach/node_modules/next/dist/docs/` before using unfamiliar APIs. `params` is a Promise (await it). lucide-react v1 removed brand icons (LinkedIn/Facebook/Instagram are inline SVGs in `components/channel-icon.tsx`).
- shadcn v4 imports from the consolidated `radix-ui` package, not `@radix-ui/react-*`.
- Theme: dark-only, defined in `app/globals.css` (`--gold`, `.heading-display`, `.label-caps`, `.gold-hairline`, `.bg-throne` utilities). Fonts: Marcellus (display), Instrument Sans (body), IBM Plex Mono (data).
- Routes live in `app/(dashboard)/`: `/` Command Center (analytics), `/leads`, `/leads/[id]`, `/audiences` (segments), `/sequences`, `/campaigns`, `/calls` (cold-call list).

## What This Is

King Circle AI's internal outreach & lead generation system: a Next.js + Supabase web dashboard that scrapes leads (Apify: Google Maps + LinkedIn), enriches them (Exa AI), generates personalized outreach copy per channel (Claude API), and executes multi-step sequences via email (Instantly.ai) and DMs (LinkedIn/Facebook/Instagram via server-side Playwright). Internal use only — not SaaS/multi-tenant.

## Locked Decisions (do not re-litigate)

- **Stack:** Next.js (App Router, TypeScript, Tailwind) on Vercel + Supabase (Postgres, Auth, Storage)
- **Email provider:** Instantly.ai
- **Scraping:** Apify primary (`compass/crawler-google-places`, `harvestapi/linkedin-profile-search`), Exa AI secondary, custom Playwright as-needed
- **DM automation:** Playwright server-side using stored session cookies (ToS risk acknowledged by owner)
- **Phantombuster:** demoted — too high ban-risk; optional future consideration only
- **Out of scope (deferred):** cold calling app (Lovable) integration, KC Dashboard pipeline connection, SaaS features, mobile app

## Key Technical Constraints

- **Exa AI does not return emails** — contact data must come from Apify extraction or a secondary enricher (Apollo.io / Hunter.io is an open decision before Phase 3)
- **Playwright must run server-side Node.js** — never in the browser or Supabase Edge Functions; use Next.js API routes or a dedicated Node service
- **Apify runs are async** (minutes to hours) — trigger run, then poll or receive webhook; never block on results
- **Official Meta/LinkedIn APIs do not support cold DMs** — that's why Playwright automation is used for all three DM channels
- **Scheduling:** Vercel Cron (1 job/day free tier) for the daily sequence processor; if hour-level precision is needed, switch to Supabase pg_cron or Inngest (open decision before Phase 6)

## Architecture Summary

Data flows: Apify scrape → `leads` table → Exa enrichment (`lead_enrichments`) → Claude copy generation (`ai_copy_cache`) → campaign assignment (`campaigns`/`campaign_leads` against `sequences`/`sequence_steps`) → outreach engine sends via channel → every touch logged in `outreach_logs`. API keys and session cookies live encrypted in `integrations`.

Full schema with field-level detail, phase breakdown (Phases 2–5 can run in parallel; Phase 6 depends on 3–5), planned file layout (`/lib/apify.ts`, `/lib/exa.ts`, `/lib/claude.ts`, `/lib/instantly.ts`, `/lib/playwright-runner.ts`, webhook + cron API routes), and verification steps are all in [plan.md](plan.md).
