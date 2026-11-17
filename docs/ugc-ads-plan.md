# Plan: AI UGC Ads via Higgsfield MCP (Phase 8.2)

**Status:** proposed, written 2026-11-16. Nothing is built yet.
**Input:** the Higgsfield MCP research brief (2026-11-16). The facts in this plan about Higgsfield (tools, models, credits, async jobs) come from that brief. Items marked **verify** have not been confirmed against the live service.
**Depends on:** generation (8.2a) depends on nothing. Publishing (8.2b) depends on Phase 8 (social accounts + Meta publish) and Phase 8.1 (the `social-media` storage bucket).
**Related:** [plan.md](../plan.md) Phase 8 / 8.1 / 10, and the `outreach.posts` / `social_jobs` tables noted under *Schema collisions* below.

---

## Goal

When asked, produce short vertical UGC-style videos that advertise King Circle AI's services. Run them through cost approval, QA and compliance labelling, then publish them through the Phase 8 posting system. Each post's results feed back into the next brief.

This plan covers organic posting only. Boosting winners into paid ads is out of scope, the same as for Phase 8.

## What we're advertising, and which formats fit

King Circle sells AI automation to the four seeded segments: missed-call follow-up for Local Home Services, booking automation for Health & Wellness, ops automation for B2B & Agencies, and intake automation for Professional & Retail. It's a service with a software surface. Nothing physical gets unboxed. So the formats that fit are:

| Format | Higgsfield skill | Use |
|---|---|---|
| **SaaS demo** | UGC Factory → SaaS UGC | A presenter shows the AI catching a missed call or booking a slot. The real product UI is composited in |
| **Tutorial / how-it-works** | UGC Factory → Tutorial | "Here's what happens when a customer calls at 9pm" |
| **Faceless explainer** | Faceless Content Factory (Whiteboard Doodle, Claymotion) | Pain-point stories with no presenter. Cheapest, and has no likeness risk |
| **Talking-head hook** | Path B (start frame → Seedance) | A segment-specific pain hook ("Roofers: you lost 3 jobs last week to voicemail") followed by the CTA |

Unboxing, Try-On and Physical UGC are **not** in scope. Localization and Ad Multiplier come later, once something has won.

## The core architectural constraint: generation runs in Claude Code, not the web app

The Higgsfield MCP authenticates with **OAuth against a Higgsfield account. It has no API key.** The Next.js app on Vercel has no clean way to hold or refresh that session. Post-production also needs FFmpeg, which runs poorly inside Vercel functions (size and time limits). So the plan splits responsibilities:

- **Claude Code (an operator session in this repo)** runs generation. It connects the MCP and uses project skills to write the brief, estimate cost, generate, poll, download, run QA, and stitch with FFmpeg (installed locally at `/usr/bin/ffmpeg`).
- **The app (Supabase + Next.js)** is the **system of record and the approval gate.** It stores briefs, credit estimates, approvals, job IDs, assets and posts. Every MCP job ID is written to the database as soon as it's submitted, so an interrupted session can pick its jobs back up (the jobs keep running on Higgsfield's side).
- **Publishing** runs through the app's Phase 8 `runSocialPublishTick()`, the same as any other post. TikTok is the exception (see 8.2b).

**Later option, not v1:** an in-app "make me an ad" button calling the Messages API's MCP connector with a stored Higgsfield token. This only works if Higgsfield offers headless or long-lived auth (**verify**: check the Higgsfield CLI's auth model). Revisit when Phase 10 agents want to generate ads themselves.

---

## Phase 8.2a: Generation (no dependencies)

### Step 0: Connect and discover
- Add the server at project scope so it's shared through the repo: `claude mcp add --transport http --scope project higgsfield https://mcp.higgsfield.ai/mcp`. This writes `.mcp.json`. Each operator signs in with OAuth once.
- Requires a **paid Higgsfield plan.** Commercial rights apply only on paid plans, and MCP generation needs one too.
- Keep tool search / deferred loading on, so the ~12K tokens of tool definitions only load when used. This is the default in current Claude Code.
- In the first session, list the tools, models, skills and credit balance, and record them in `.claude/skills/ugc-ad/reference/higgsfield-tools.md` with the date. Skills **read tool and model names from that file** and never hard-code them. Re-run discovery whenever a call fails with an unknown tool or model.

### Step 1: Schema (migration `0009_ugc.sql`, `outreach` schema)

All new tables use a `ugc_` prefix so they can't collide with the existing `posts` / `social_jobs` tables.

| Table | Purpose | Key columns |
|---|---|---|
| `ugc_products` | What's being advertised (one per offering, optionally per segment) | name, segment_id, description, **verified_claims** jsonb (`[{claim, source}]`), ui_footage_paths text[], default_cta |
| `ugc_personas` | Reusable presenters | name, kind (`soul_character` \| `master_image` \| `faceless`), higgsfield_ref, image_path, description, **is_ai_generated** bool, consent_doc_path (required when not AI-generated, enforced by a check constraint) |
| `ugc_briefs` | One ad request | product_id, segment_id, goal, platforms[], format, path (`A` \| `B`), variant_count, audience, magic_moment, cta, **status** (`draft` → `estimated` → `approved` → `generating` → `qa` → `ready` → `published`, or `rejected`), **est_credits**, actual_credits, approved_by, approved_at |
| `ugc_variants` | One script per variant (hook × body × CTA) | brief_id, persona_id, hook, body, cta, script_clips jsonb (timestamped), **variable_under_test** (`hook` \| `persona` \| `cta` \| `none`), claims_used text[] |
| `ugc_jobs` | Higgsfield job tracker | variant_id, higgsfield_job_id, skill_or_model, kind (`start_frame` \| `test_take` \| `clip` \| `full` \| `upscale`), prompt, status (`queued` \| `in_progress` \| `completed` \| `failed` \| `nsfw`), est_credits, actual_credits, result_url, storage_path, attempts, error, submitted_at, completed_at |
| `ugc_assets` | Final stitched deliverable per variant | variant_id, storage_path, public_url, duration_s, width, height, **qa** jsonb (checklist results), virality_score, approved_for_publish bool |

Also add a view, `ugc_credit_ledger`, that sums `actual_credits` by month for spend tracking. Higgsfield has no spend cap, so this view is the only spend control there is.

The schema stores **videos in Supabase Storage**, which means pulling Phase 8.1's `social-media` bucket forward into 8.2a. Allow `video/mp4`. A 15s 1080p clip is usually tens of MB, so check the project's per-file upload limit before relying on it (**verify**: kc-backend's plan limit).

### Step 2: Skills (`.claude/skills/`)

Each format is its own skill with a validated prompt template, which is the pattern other builders use. They all share one orchestrator.

- **`ugc-ad`** (orchestrator). The input is a plain request ("3 hook variants of a missed-call ad for roofers, for IG Reels"). The flow:
  1. **Brief.** Pick the product and segment. Draft the audience, magic moment and CTA. Use **only claims from `ugc_products.verified_claims`**, and stop to ask for anything else. Insert a `ugc_briefs` row.
  2. **Scripts.** Write N variants, changing **one variable at a time** (default: the hook), each 13–15s and split into timestamped clips. Insert `ugc_variants` rows.
  3. **Estimate.** Check the credit balance, total the per-job estimates, write `est_credits`, and set the status to `estimated`. Print the estimate and **stop**.
  4. **Gate.** Continue only when the brief is `approved` in the app and `est_credits` fits the per-brief cap and the remaining monthly budget (see *Open decisions*).
  5. **Generate.** Use Path A or Path B (below). Write each job ID to `ugc_jobs` immediately after submitting it.
  6. **Poll and download.** Retry each failure with a revised prompt, capped at 2 attempts per job. `nsfw` results are never retried automatically.
  7. **QA**, then **post-production**, then upload to `ugc_assets`.
- **Format skills**, each holding a prompt template plus the format's defaults (model, duration, negative constraints):
  - `ugc-saas-demo`
  - `ugc-tutorial`
  - `ugc-faceless`
  - `ugc-talking-hook`
- **`ugc-resume`** reads `ugc_jobs` rows that are still `queued` or `in_progress`, polls them, and finishes whatever the last session left open.

### Generation paths
- **Path A (default for SaaS demo, Tutorial, Faceless):** one UGC Factory / Faceless skill call per variant. It returns a stitched vertical clip with captions.
- **Path B (default for Talking-head hook, or whenever a brief asks for specific shots):**
  1. Make a master start frame (Soul 2.0 or Nano Banana Pro, 9:16), or use the persona's saved Soul Character.
  2. Generate **one test take** on Seedance and **stop for review**.
  3. Batch the remaining clips with the same start frame and persona.
  4. FFmpeg stitch.

  Animation prompts must include:
  - the locked-off or handheld camera
  - the exact dialogue
  - the pacing
  - the negatives: no drift, no zooms, no scene changes, no music, no captions, no new objects
- **Models live in config, not code.** Defaults go in `.claude/skills/ugc-ad/reference/models.md`:
  - Seedance for lip-synced talking shots
  - Kling 3.0 for B-roll and hooks
  - Kling 2.5 Turbo for drafts
  - FLUX for thumbnails

### QA (written to `ugc_assets.qa`; any fail blocks the asset)
- **Lip sync** stays aligned with the dialogue.
- **Hands** look coherent.
- **The face** stays the same for the whole clip.
- **The UI** on screen is real footage from `ui_footage_paths`, never generated by AI.
- **Every spoken or on-screen claim** is in `claims_used`, and every item in `claims_used` is in the product's `verified_claims`.
- **The presenter demonstrates or explains** and never poses as a customer giving a testimonial.
- **Optional:** run the Virality Predictor and save the score. It's used to rank variants and is never a gate.

When a QA check fails, the fix is to simplify the action or repair the start frame, not to re-roll blindly.

### Post-production (local FFmpeg)
- Stitch the clips.
- Composite the real product screen recording.
- Burn in captions.
- Normalize audio.
- Export 9:16 H.264/AAC MP4.
- Generate a thumbnail.
- Upload to `social-media/ugc/<brief_id>/<variant_id>.mp4`.

### Step 3: App UI (`/social/ads`)
Built as `page.tsx` / `-client.tsx` plus server actions in `app/actions/ugc.ts`, the same pattern as Sequences and Campaigns. The page has:

- **Briefs list**, showing status, est vs. actual credits and variant count.
- **Approve / reject buttons**, which are the cost gate the skill waits on. Only `AUTH_ALLOWED_EMAILS` users can press them, and approval records `approved_by`.
- **Asset review:** play each variant, see its QA results, and mark it approved for publish.
- **Libraries:** products (with verified claims), personas (with consent docs), and the credit ledger for this month.

---

## Phase 8.2b: Publishing (depends on Phase 8 + 8.1)

- **Video publishing in `lib/meta.ts`.** Phase 8 is text-only and 8.1 adds images, so 8.2b adds Instagram Reels (a container with `media_type=REELS` and `video_url`, polled until ready, then published) and Facebook Page video/Reels. Both pull from the bucket's public URL.
- **Linking `social_posts`.** Add `ugc_asset_id`, `ai_label_applied` bool, and `disclosure_text`. Publishing an asset creates one draft per platform. Check for duplicates first: one post per asset per platform.
- **AI label (a hard gate).** `runSocialPublishTick()` refuses to publish any post with a `ugc_asset_id` unless `ai_label_applied` is true.
  - Set the platform's AI flag through the API where one exists (**verify** for Meta organic Reels and the TikTok content API).
  - Where no API flag exists, the operator applies the label by hand and ticks a confirmation box, which records who confirmed it and when.
- **Disclosure in the caption.** Append a configurable AI-performer disclosure. New York has required disclosing AI-generated performers in ads since 2026-06-09. Add `#ad` when a post is promotional (**verify** wording with whoever owns compliance).
- **TikTok.** Phase 8 has no TikTok wrapper. v1 uses **Higgsfield's direct TikTok post** from the operator session (caption, privacy and AI declaration reviewed there), then records the TikTok post ID back on a `social_posts` row with `platform='tiktok'` so results stay in one place. A native TikTok wrapper waits for TikTok to become a real channel.
- **Attribution.** UGC posts carry a Phase 8 `tracking_code` link to `/lp/[code]`, so captured leads land in `leads` with `source_post_id`. No new attribution work is needed.

## Feedback loop
- The `/social/performance` page gains a **UGC breakdown**: metrics grouped by `variable_under_test` and by hook. Variants are only ever compared within the same platform and time window.
- The `ugc-ad` brief step reads the top-performing hooks for the segment before writing new ones. That ranking *is* the hook bank, and it doesn't need its own table.
- The Phase 10 Analyst agent can later propose UGC briefs, which land as `draft` and still need human approval.

---

## Guardrails (always on)
- **Cost:**
  - No generation without an `approved` brief, an estimate inside the per-brief cap, and room left in the monthly budget.
  - Path B always stops after the test take.
  - Re-rolls count against the same brief budget.
- **Claims:** only `verified_claims`, and a claim with no source is rejected.
- **Likeness:**
  - Use AI-generated personas only.
  - A real face requires a consent document, enforced by a database constraint.
  - The owner's face is never used.
- **No fake testimonials.** The presenter demonstrates or explains and never says "I'm a customer".
- **Official access only.** Use the official MCP or CLI. Never use "unlimited" wrappers that reuse browser sessions.
- **AI labelling.** Publishing is blocked until the label is applied and logged.

## Schema collisions to resolve first
The live `outreach` schema already has `posts`, `social_jobs`, `platform_settings`, `conversations`, `conversation_messages` and `templates`. No migration in this repo creates them and all are empty. They look like scaffolding for a Playwright social/DM worker (`claimed_at`, `session_status`, DM caps). Before Phase 8 writes `social_posts`, find out who created them and either adopt `posts` as the Phase 8 table or drop it. 8.2 doesn't care which: it only adds `ugc_*` tables plus the three columns on the posts table.

## Build order
1. **Step 0:** connect the MCP and record the tool and model reference. Do one manual Path A test ad (about 166 credits for a 15s ad, per Higgsfield's own example) to confirm quality before building anything.
2. **Migration 0009:** add the `ugc_*` tables and the bucket (bucket pulled forward from 8.1).
3. **Skills:** the `ugc-ad` orchestrator, `ugc-faceless` first (cheapest, no persona), then `ugc-saas-demo`, then `ugc-tutorial` and `ugc-talking-hook`, then `ugc-resume`.
4. **The `/social/ads` page:** approval gate, asset review, libraries, ledger.
5. **8.2b**, after Phase 8 and 8.1 land: Reels/video publish, label gate, TikTok via Higgsfield, the UGC performance breakdown.

## Verification
1. A fresh operator session connects the Higgsfield MCP through OAuth, and the skill reads tool names from the reference file. A renamed tool fails with a clear "re-run discovery" message.
2. `ugc-ad` stops at `estimated` and doesn't submit any job until the brief is approved in `/social/ads`. An estimate over the cap can't be approved.
3. Killing the session mid-generation, then running `ugc-resume`, finishes the jobs from `ugc_jobs` without resubmitting them.
4. A script containing a claim that isn't in `verified_claims` is rejected at the brief step.
5. A Path B brief stops after one test take.
6. The final asset is a 9:16 MP4 with burned-in captions and real UI footage, uploaded to the bucket. The QA JSON is filled in.
7. A UGC post with `ai_label_applied = false` is refused by `runSocialPublishTick()`.
8. A published Reel stores `external_post_id`. A lead from its `/lp/[code]` page carries `source_post_id`.
9. `ugc_credit_ledger` matches the Higgsfield balance change for the month to within re-roll noise.

## Open decisions
| Decision | Recommendation |
|---|---|
| Approval gate | Per-brief approval in `/social/ads`, plus a per-brief credit cap and a monthly credit budget in config. The numbers are yours to set; Plus is 1,000 credits/mo, about 6 Path A ads |
| Higgsfield plan | Plus to start. Credits don't roll over, so size the plan to the monthly budget |
| Default path per format | A for SaaS, Tutorial and Faceless. B for talking-head hooks |
| First personas | 2–3 AI master images (one per main segment's audience vibe). Train a Soul Character (about 40 credits) only for a persona that wins |
| TikTok posting | Higgsfield direct post in v1. Native wrapper later |
| Research step (Apify outlier scraping, Meta Ad Library) | Later. Start from segment pain points plus our own results |
| Clients | v1 makes ads for King Circle only. Making UGC *for clients* would need per-client products, personas and billing, which is a separate scope |
