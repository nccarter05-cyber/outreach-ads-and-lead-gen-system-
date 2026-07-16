-- Seed: 4 audience segments + 3 sequences (11 steps) — the real outreach
-- strategy carried over from the UI MVP. Fixed UUIDs so all environments match.
-- Applied 2026-07-15 as migration "outreach_0002_seed".

set search_path to outreach;

insert into segments (id, name, description, criteria) values
  ('a0000000-0000-4000-8000-000000000001', 'Local Home Services',
   'Owner-operated contractors — roofing, HVAC, plumbing, solar, paving. Pain: missed calls and slow follow-up while crews are on jobs.',
   '{"Google Maps sourced","Has phone","Owner reachable","Service-area business"}'),
  ('a0000000-0000-4000-8000-000000000002', 'Health & Wellness',
   'Dental, med spa, fitness, senior care. Pain: phone-only scheduling, no-shows, owner-handled DMs. Warm to booking automation.',
   '{"Appointment-driven","Active on Instagram","Review velocity high"}'),
  ('a0000000-0000-4000-8000-000000000003', 'B2B & Agencies',
   'SaaS, logistics, creative agencies with 10–200 staff. Pain: manual ops and reporting. LinkedIn-first outreach with email follow-up.',
   '{"LinkedIn sourced","Decision maker title","Hiring ops roles","AI-receptive"}'),
  ('a0000000-0000-4000-8000-000000000004', 'Professional & Retail',
   'Law, accounting, real estate, dealerships, restaurants. Pain: slow intake and lead response. Compliance-aware messaging, email-led.',
   '{"Has email","Multi-location or partner-led","Intake-driven"}');

insert into sequences (id, name, description, segment_id) values
  ('b0000000-0000-4000-8000-000000000001', 'Local Business Blitz',
   'Email-first sequence for Google Maps leads. Falls back to Facebook and Instagram DMs for owners who live on social.',
   'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'LinkedIn-First B2B',
   'For LinkedIn-sourced decision makers. Opens with a DM, escalates to email with a personalized value prop.',
   'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000003', 'Founder Warm Intro',
   'Slow-burn three-touch sequence for high-value founders. Heavy personalization, zero templates-feel.',
   'a0000000-0000-4000-8000-000000000004');

insert into sequence_steps (id, sequence_id, step_order, delay_days, channel, copy_source, template_prompt) values
  ('c0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001', 1, 0, 'email', 'claude',
   'Short intro email. Reference one specific thing about their business (reviews, location, service). Offer: AI receptionist that answers missed calls and books jobs. One-line CTA for a 10-minute call.'),
  ('c0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000001', 2, 3, 'facebook', 'claude',
   'Casual Facebook DM. Mention you emailed them. One concrete benefit tied to their business type. Keep under 50 words.'),
  ('c0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000001', 3, 4, 'email', 'claude',
   'Follow-up email with a one-sentence case study result (missed-call recovery stat). Soft CTA: reply ''curious'' for a 2-minute demo video.'),
  ('c0000000-0000-4000-8000-000000000104', 'b0000000-0000-4000-8000-000000000001', 4, 5, 'instagram', 'claude',
   'Very short IG DM, curiosity hook. Reference their recent post if enrichment found one. Under 30 words.'),
  ('c0000000-0000-4000-8000-000000000201', 'b0000000-0000-4000-8000-000000000002', 1, 0, 'linkedin', 'claude',
   'Conversational LinkedIn opener. Reference their recent post or hiring signal from enrichment. No pitch — end with a genuine question about their workflow.'),
  ('c0000000-0000-4000-8000-000000000202', 'b0000000-0000-4000-8000-000000000002', 2, 2, 'linkedin', 'claude',
   'Short bump message. Add one insight relevant to their industry. Still no hard pitch.'),
  ('c0000000-0000-4000-8000-000000000203', 'b0000000-0000-4000-8000-000000000002', 3, 3, 'email', 'claude',
   'Email with subject line referencing the LinkedIn thread. Concrete value prop: AI agents that handle [their pain point from enrichment]. CTA: 15-minute walkthrough.'),
  ('c0000000-0000-4000-8000-000000000204', 'b0000000-0000-4000-8000-000000000002', 4, 6, 'email', 'claude',
   'Breakup email. Light tone, leave the door open, include one-line social proof.'),
  ('c0000000-0000-4000-8000-000000000301', 'b0000000-0000-4000-8000-000000000003', 1, 0, 'email', 'claude',
   'Highly personalized email referencing two enrichment signals. Position King Circle AI as a builder, not a vendor. CTA: ''worth a conversation?'''),
  ('c0000000-0000-4000-8000-000000000302', 'b0000000-0000-4000-8000-000000000003', 2, 4, 'linkedin', 'claude',
   'Connect + note referencing the email. Mention one specific thing their company is doing well.'),
  ('c0000000-0000-4000-8000-000000000303', 'b0000000-0000-4000-8000-000000000003', 3, 7, 'email', 'claude',
   'Final touch: share a relevant build (one sentence) and a loom-style video link placeholder. No pressure close.');

insert into integrations (name, api_key, meta) values ('instantly', null, '{}');
