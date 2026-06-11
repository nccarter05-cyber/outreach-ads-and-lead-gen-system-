// Mock data layer for the UI MVP. Mirrors the planned Supabase schema
// (leads, lead_enrichments, sequences, sequence_steps, campaigns,
// campaign_leads, outreach_logs, ai_copy_cache) so swapping in real
// queries later is a drop-in change.

export type Channel = "email" | "linkedin" | "facebook" | "instagram";

export type LeadSource = "google_maps" | "linkedin" | "manual";

export type LeadStatus =
  | "new"
  | "enriched"
  | "in_sequence"
  | "contacted"
  | "replied"
  | "booked"
  | "not_interested";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type TouchStatus = "scheduled" | "sent" | "opened" | "replied" | "failed";

export interface Segment {
  id: string;
  name: string;
  description: string;
  criteria: string[];
}

export interface Enrichment {
  summary: string;
  industry: string;
  companySize: string;
  website: string;
  signals: string[];
  enrichedAt: string;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  title: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  location: string;
  source: LeadSource;
  status: LeadStatus;
  segmentId: string;
  createdAt: string;
  enrichment?: Enrichment;
}

export interface SequenceStep {
  id: string;
  stepOrder: number;
  delayDays: number;
  channel: Channel;
  templatePrompt: string;
}

export interface Sequence {
  id: string;
  name: string;
  description: string;
  segmentId?: string;
  steps: SequenceStep[];
  createdAt: string;
}

export interface CampaignSchedule {
  timezone: string;
  days: Weekday[];
  windowStart: string;
  windowEnd: string;
  dailyCap: number;
}

export interface Campaign {
  id: string;
  name: string;
  sequenceId: string;
  status: CampaignStatus;
  leadIds: string[];
  schedule: CampaignSchedule;
  createdAt: string;
  stats: {
    sent: number;
    opened: number;
    replied: number;
    booked: number;
  };
}

export interface OutreachLog {
  id: string;
  leadId: string;
  campaignId: string;
  channel: Channel;
  status: TouchStatus;
  at: string;
  copy: string;
}

export interface AiCopy {
  leadId: string;
  channel: Channel;
  subject?: string;
  body: string;
  generatedAt: string;
}

export interface CallScript {
  leadId: string;
  opener: string;
  valueProp: string;
  questions: string[];
  close: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Audience segments
// ---------------------------------------------------------------------------

export const segments: Segment[] = [
  {
    id: "seg-001",
    name: "Local Home Services",
    description:
      "Owner-operated contractors — roofing, HVAC, plumbing, solar, paving. Pain: missed calls and slow follow-up while crews are on jobs.",
    criteria: ["Google Maps sourced", "Has phone", "Owner reachable", "Service-area business"],
  },
  {
    id: "seg-002",
    name: "Health & Wellness",
    description:
      "Dental, med spa, fitness, senior care. Pain: phone-only scheduling, no-shows, owner-handled DMs. Warm to booking automation.",
    criteria: ["Appointment-driven", "Active on Instagram", "Review velocity high"],
  },
  {
    id: "seg-003",
    name: "B2B & Agencies",
    description:
      "SaaS, logistics, creative agencies with 10–200 staff. Pain: manual ops and reporting. LinkedIn-first outreach with email follow-up.",
    criteria: ["LinkedIn sourced", "Decision maker title", "Hiring ops roles", "AI-receptive"],
  },
  {
    id: "seg-004",
    name: "Professional & Retail",
    description:
      "Law, accounting, real estate, dealerships, restaurants. Pain: slow intake and lead response. Compliance-aware messaging, email-led.",
    criteria: ["Has email", "Multi-location or partner-led", "Intake-driven"],
  },
];

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const leads: Lead[] = [
  {
    id: "ld-001",
    name: "Marcus Hale",
    company: "Hale Roofing & Exteriors",
    title: "Owner",
    email: "marcus@haleroofing.com",
    phone: "(614) 555-0188",
    facebookUrl: "facebook.com/haleroofing",
    instagramUrl: "@haleroofingco",
    location: "Columbus, OH",
    source: "google_maps",
    status: "replied",
    segmentId: "seg-001",
    createdAt: "2026-05-28T14:22:00Z",
    enrichment: {
      summary:
        "Family-owned roofing contractor serving central Ohio since 2009. Strong review profile (4.8 on Google, 310+ reviews) but no online booking and a dated website. Runs seasonal promotions manually via Facebook.",
      industry: "Roofing / Home Services",
      companySize: "11–50",
      website: "haleroofing.com",
      signals: ["Hiring estimators", "No chat widget", "Active on Facebook", "Storm season ramp-up"],
      enrichedAt: "2026-05-29T09:10:00Z",
    },
  },
  {
    id: "ld-002",
    name: "Dr. Priya Natarajan",
    company: "Brightside Dental Studio",
    title: "Practice Owner",
    email: "priya@brightsidedental.co",
    phone: "(380) 555-0142",
    instagramUrl: "@brightsidedentalstudio",
    location: "Dublin, OH",
    source: "google_maps",
    status: "booked",
    segmentId: "seg-002",
    createdAt: "2026-05-28T14:22:00Z",
    enrichment: {
      summary:
        "Boutique dental practice with two locations and a waitlist for cosmetic work. Front desk handles all scheduling by phone; no-show rate is a known pain point per recent review replies.",
      industry: "Dental / Healthcare",
      companySize: "11–50",
      website: "brightsidedental.co",
      signals: ["Two locations", "Phone-only scheduling", "High review velocity", "Cosmetic waitlist"],
      enrichedAt: "2026-05-29T09:12:00Z",
    },
  },
  {
    id: "ld-003",
    name: "Tom Reicher",
    company: "Reicher HVAC Solutions",
    title: "General Manager",
    email: "tom@reicherhvac.com",
    phone: "(614) 555-0117",
    facebookUrl: "facebook.com/reicherhvac",
    location: "Westerville, OH",
    source: "google_maps",
    status: "contacted",
    segmentId: "seg-001",
    createdAt: "2026-05-28T14:25:00Z",
    enrichment: {
      summary:
        "Mid-size HVAC outfit with 14 trucks. Dispatch runs on spreadsheets; owner posted in a trade group about missed after-hours calls. Prime fit for AI call handling.",
      industry: "HVAC / Home Services",
      companySize: "11–50",
      website: "reicherhvac.com",
      signals: ["Missed after-hours calls", "Spreadsheet dispatch", "14 trucks", "Summer surge"],
      enrichedAt: "2026-05-30T11:40:00Z",
    },
  },
  {
    id: "ld-004",
    name: "Angela Moss",
    company: "Moss & Vine Law Group",
    title: "Managing Partner",
    email: "amoss@mossvinelaw.com",
    phone: "(614) 555-0163",
    linkedinUrl: "linkedin.com/in/angelamoss-law",
    location: "Columbus, OH",
    source: "google_maps",
    status: "in_sequence",
    segmentId: "seg-004",
    createdAt: "2026-05-28T14:26:00Z",
    enrichment: {
      summary:
        "Estate planning and family law firm, 6 attorneys. Intake is email-based with slow response times noted in reviews. Recently expanded into elder law.",
      industry: "Legal Services",
      companySize: "2–10",
      website: "mossvinelaw.com",
      signals: ["Slow intake response", "Practice expansion", "No intake automation"],
      enrichedAt: "2026-05-30T11:42:00Z",
    },
  },
  {
    id: "ld-005",
    name: "Derek Okafor",
    company: "Ironline Fitness",
    title: "Founder",
    email: "derek@ironlinefit.com",
    instagramUrl: "@ironlinefitness",
    facebookUrl: "facebook.com/ironlinefit",
    location: "Columbus, OH",
    source: "google_maps",
    status: "in_sequence",
    segmentId: "seg-002",
    createdAt: "2026-05-28T14:28:00Z",
    enrichment: {
      summary:
        "Independent gym with 900+ members and a strong Instagram presence (22k followers). Membership churn handled manually; no win-back campaigns running.",
      industry: "Fitness",
      companySize: "11–50",
      website: "ironlinefit.com",
      signals: ["22k IG followers", "Manual churn handling", "No email automation"],
      enrichedAt: "2026-05-30T11:45:00Z",
    },
  },
  {
    id: "ld-006",
    name: "Sandra Liu",
    company: "Golden Wok Restaurant Group",
    title: "Operations Director",
    phone: "(614) 555-0124",
    facebookUrl: "facebook.com/goldenwokgroup",
    location: "Columbus, OH",
    source: "google_maps",
    status: "new",
    segmentId: "seg-004",
    createdAt: "2026-06-02T10:05:00Z",
  },
  {
    id: "ld-007",
    name: "Jeff Brandt",
    company: "Brandt Custom Cabinets",
    title: "Owner",
    email: "jeff@brandtcabinets.com",
    phone: "(740) 555-0191",
    location: "Newark, OH",
    source: "google_maps",
    status: "new",
    segmentId: "seg-001",
    createdAt: "2026-06-02T10:05:00Z",
  },
  {
    id: "ld-008",
    name: "Rachel Kim",
    company: "Lumen Creative Agency",
    title: "CEO",
    email: "rachel@lumencreative.io",
    linkedinUrl: "linkedin.com/in/rachelkim-lumen",
    instagramUrl: "@lumencreative",
    location: "Cincinnati, OH",
    source: "linkedin",
    status: "replied",
    segmentId: "seg-003",
    createdAt: "2026-05-25T16:40:00Z",
    enrichment: {
      summary:
        "12-person creative agency serving DTC brands. Posted on LinkedIn about drowning in client reporting. Evaluating AI tooling per a recent podcast appearance.",
      industry: "Marketing / Creative",
      companySize: "11–50",
      website: "lumencreative.io",
      signals: ["Pain: client reporting", "AI-curious", "Podcast appearance", "DTC client base"],
      enrichedAt: "2026-05-26T08:30:00Z",
    },
  },
  {
    id: "ld-009",
    name: "David Strand",
    company: "Strand Logistics",
    title: "VP of Operations",
    email: "d.strand@strandlogistics.com",
    linkedinUrl: "linkedin.com/in/davidstrand-ops",
    location: "Indianapolis, IN",
    source: "linkedin",
    status: "contacted",
    segmentId: "seg-003",
    createdAt: "2026-05-25T16:42:00Z",
    enrichment: {
      summary:
        "Regional 3PL with 80 employees. Hiring two ops coordinators — classic signal of process strain. Active commenter on supply-chain automation posts.",
      industry: "Logistics / 3PL",
      companySize: "51–200",
      website: "strandlogistics.com",
      signals: ["Hiring ops roles", "Engages with automation content", "Regional growth"],
      enrichedAt: "2026-05-26T08:32:00Z",
    },
  },
  {
    id: "ld-010",
    name: "Maria Esposito",
    company: "Esposito Realty Partners",
    title: "Broker / Owner",
    email: "maria@espositorealty.com",
    phone: "(614) 555-0177",
    linkedinUrl: "linkedin.com/in/mariaesposito-re",
    instagramUrl: "@espositorealty",
    location: "Columbus, OH",
    source: "linkedin",
    status: "in_sequence",
    segmentId: "seg-004",
    createdAt: "2026-05-25T16:45:00Z",
    enrichment: {
      summary:
        "Brokerage with 24 agents. Leads from Zillow go uncontacted for hours on weekends — mentioned this in a local realtor Facebook group. Wants speed-to-lead.",
      industry: "Real Estate",
      companySize: "11–50",
      website: "espositorealty.com",
      signals: ["Slow speed-to-lead", "24 agents", "Weekend coverage gap"],
      enrichedAt: "2026-05-27T13:15:00Z",
    },
  },
  {
    id: "ld-011",
    name: "Chris Vaughn",
    company: "Vaughn Solar Co.",
    title: "Co-Founder",
    email: "chris@vaughnsolar.com",
    linkedinUrl: "linkedin.com/in/chrisvaughn-solar",
    facebookUrl: "facebook.com/vaughnsolar",
    location: "Dayton, OH",
    source: "linkedin",
    status: "enriched",
    segmentId: "seg-001",
    createdAt: "2026-06-01T09:20:00Z",
    enrichment: {
      summary:
        "Residential solar installer scaling from 8 to 20 reps this year. Door-knocking heavy; no CRM-integrated follow-up. Co-founder asks for SDR tooling recs on LinkedIn.",
      industry: "Solar / Energy",
      companySize: "11–50",
      website: "vaughnsolar.com",
      signals: ["Scaling sales team", "Asked for SDR tooling recs", "No CRM follow-up"],
      enrichedAt: "2026-06-02T15:00:00Z",
    },
  },
  {
    id: "ld-012",
    name: "Nina Petrova",
    company: "Petrova Med Spa",
    title: "Owner",
    email: "nina@petrovamedspa.com",
    phone: "(614) 555-0136",
    instagramUrl: "@petrovamedspa",
    location: "Upper Arlington, OH",
    source: "google_maps",
    status: "enriched",
    segmentId: "seg-002",
    createdAt: "2026-06-01T09:22:00Z",
    enrichment: {
      summary:
        "High-end med spa with strong IG engagement. Books via DM replies handled personally by the owner — slow during treatment hours. Membership program launching this fall.",
      industry: "Med Spa / Aesthetics",
      companySize: "2–10",
      website: "petrovamedspa.com",
      signals: ["Owner handles DMs", "Membership launch", "High IG engagement"],
      enrichedAt: "2026-06-02T15:05:00Z",
    },
  },
  {
    id: "ld-013",
    name: "Hank Dawson",
    company: "Dawson Brothers Paving",
    title: "President",
    phone: "(740) 555-0109",
    location: "Lancaster, OH",
    source: "google_maps",
    status: "new",
    segmentId: "seg-001",
    createdAt: "2026-06-05T08:15:00Z",
  },
  {
    id: "ld-014",
    name: "Felicia Grant",
    company: "Grant Accounting Advisors",
    title: "Principal",
    email: "felicia@grantadvisors.cpa",
    linkedinUrl: "linkedin.com/in/feliciagrant-cpa",
    location: "Columbus, OH",
    source: "linkedin",
    status: "not_interested",
    segmentId: "seg-004",
    createdAt: "2026-05-25T16:50:00Z",
  },
  {
    id: "ld-015",
    name: "Omar Haddad",
    company: "Haddad Auto Group",
    title: "General Manager",
    email: "omar@haddadauto.com",
    phone: "(614) 555-0152",
    facebookUrl: "facebook.com/haddadautogroup",
    instagramUrl: "@haddadauto",
    location: "Columbus, OH",
    source: "google_maps",
    status: "new",
    segmentId: "seg-004",
    createdAt: "2026-06-05T08:18:00Z",
  },
  {
    id: "ld-016",
    name: "Beth Calloway",
    company: "Calloway Senior Care",
    title: "Executive Director",
    email: "beth@callowaycare.com",
    phone: "(614) 555-0195",
    location: "Grove City, OH",
    source: "google_maps",
    status: "new",
    segmentId: "seg-002",
    createdAt: "2026-06-05T08:20:00Z",
  },
  {
    id: "ld-017",
    name: "Jason Toth",
    company: "Toth Plumbing & Drain",
    title: "Owner",
    phone: "(614) 555-0171",
    facebookUrl: "facebook.com/tothplumbing",
    location: "Hilliard, OH",
    source: "google_maps",
    status: "new",
    segmentId: "seg-001",
    createdAt: "2026-06-08T12:00:00Z",
  },
  {
    id: "ld-018",
    name: "Alyssa Chen",
    company: "Northbridge SaaS Labs",
    title: "Head of Growth",
    email: "alyssa@northbridgelabs.com",
    linkedinUrl: "linkedin.com/in/alyssachen-growth",
    location: "Chicago, IL",
    source: "linkedin",
    status: "enriched",
    segmentId: "seg-003",
    createdAt: "2026-06-04T11:30:00Z",
    enrichment: {
      summary:
        "Growth lead at a 40-person B2B SaaS. Building outbound motion from scratch; posted a thread comparing outbound tools. Warm to AI-personalized copy.",
      industry: "B2B SaaS",
      companySize: "11–50",
      website: "northbridgelabs.com",
      signals: ["Building outbound from scratch", "Tool comparison thread", "AI-receptive"],
      enrichedAt: "2026-06-05T10:00:00Z",
    },
  },
];

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

export const sequences: Sequence[] = [
  {
    id: "seq-001",
    name: "Local Business Blitz",
    segmentId: "seg-001",
    description:
      "Email-first sequence for Google Maps leads. Falls back to Facebook and Instagram DMs for owners who live on social.",
    createdAt: "2026-05-20T10:00:00Z",
    steps: [
      {
        id: "st-101",
        stepOrder: 1,
        delayDays: 0,
        channel: "email",
        templatePrompt:
          "Short intro email. Reference one specific thing about their business (reviews, location, service). Offer: AI receptionist that answers missed calls and books jobs. One-line CTA for a 10-minute call.",
      },
      {
        id: "st-102",
        stepOrder: 2,
        delayDays: 3,
        channel: "facebook",
        templatePrompt:
          "Casual Facebook DM. Mention you emailed them. One concrete benefit tied to their business type. Keep under 50 words.",
      },
      {
        id: "st-103",
        stepOrder: 3,
        delayDays: 4,
        channel: "email",
        templatePrompt:
          "Follow-up email with a one-sentence case study result (missed-call recovery stat). Soft CTA: reply 'curious' for a 2-minute demo video.",
      },
      {
        id: "st-104",
        stepOrder: 4,
        delayDays: 5,
        channel: "instagram",
        templatePrompt:
          "Very short IG DM, curiosity hook. Reference their recent post if enrichment found one. Under 30 words.",
      },
    ],
  },
  {
    id: "seq-002",
    name: "LinkedIn-First B2B",
    segmentId: "seg-003",
    description:
      "For LinkedIn-sourced decision makers. Opens with a DM, escalates to email with a personalized value prop.",
    createdAt: "2026-05-22T10:00:00Z",
    steps: [
      {
        id: "st-201",
        stepOrder: 1,
        delayDays: 0,
        channel: "linkedin",
        templatePrompt:
          "Conversational LinkedIn opener. Reference their recent post or hiring signal from enrichment. No pitch — end with a genuine question about their workflow.",
      },
      {
        id: "st-202",
        stepOrder: 2,
        delayDays: 2,
        channel: "linkedin",
        templatePrompt:
          "Short bump message. Add one insight relevant to their industry. Still no hard pitch.",
      },
      {
        id: "st-203",
        stepOrder: 3,
        delayDays: 3,
        channel: "email",
        templatePrompt:
          "Email with subject line referencing the LinkedIn thread. Concrete value prop: AI agents that handle [their pain point from enrichment]. CTA: 15-minute walkthrough.",
      },
      {
        id: "st-204",
        stepOrder: 4,
        delayDays: 6,
        channel: "email",
        templatePrompt:
          "Breakup email. Light tone, leave the door open, include one-line social proof.",
      },
    ],
  },
  {
    id: "seq-003",
    name: "Founder Warm Intro",
    segmentId: "seg-004",
    description:
      "Slow-burn three-touch sequence for high-value founders. Heavy personalization, zero templates-feel.",
    createdAt: "2026-06-01T10:00:00Z",
    steps: [
      {
        id: "st-301",
        stepOrder: 1,
        delayDays: 0,
        channel: "email",
        templatePrompt:
          "Highly personalized email referencing two enrichment signals. Position King Circle AI as a builder, not a vendor. CTA: 'worth a conversation?'",
      },
      {
        id: "st-302",
        stepOrder: 2,
        delayDays: 4,
        channel: "linkedin",
        templatePrompt:
          "Connect + note referencing the email. Mention one specific thing their company is doing well.",
      },
      {
        id: "st-303",
        stepOrder: 3,
        delayDays: 7,
        channel: "email",
        templatePrompt:
          "Final touch: share a relevant build (one sentence) and a loom-style video link placeholder. No pressure close.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export const campaigns: Campaign[] = [
  {
    id: "cmp-001",
    name: "Columbus Home Services — June",
    sequenceId: "seq-001",
    status: "active",
    leadIds: ["ld-001", "ld-003", "ld-004", "ld-005", "ld-012", "ld-017"],
    schedule: {
      timezone: "America/New_York",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      windowStart: "08:00",
      windowEnd: "17:00",
      dailyCap: 25,
    },
    createdAt: "2026-06-01T09:00:00Z",
    stats: { sent: 14, opened: 9, replied: 3, booked: 1 },
  },
  {
    id: "cmp-002",
    name: "B2B Ops Leaders — Midwest",
    sequenceId: "seq-002",
    status: "active",
    leadIds: ["ld-008", "ld-009", "ld-010", "ld-011", "ld-018"],
    schedule: {
      timezone: "America/Chicago",
      days: ["Tue", "Wed", "Thu"],
      windowStart: "09:00",
      windowEnd: "16:00",
      dailyCap: 15,
    },
    createdAt: "2026-05-26T09:00:00Z",
    stats: { sent: 11, opened: 7, replied: 2, booked: 0 },
  },
  {
    id: "cmp-003",
    name: "Dental & Med Spa Pilot",
    sequenceId: "seq-001",
    status: "completed",
    leadIds: ["ld-002", "ld-012"],
    schedule: {
      timezone: "America/New_York",
      days: ["Mon", "Wed", "Fri"],
      windowStart: "10:00",
      windowEnd: "15:00",
      dailyCap: 10,
    },
    createdAt: "2026-05-29T09:00:00Z",
    stats: { sent: 6, opened: 5, replied: 2, booked: 1 },
  },
  {
    id: "cmp-004",
    name: "Founder Outreach — Q3 Warmup",
    sequenceId: "seq-003",
    status: "draft",
    leadIds: ["ld-006", "ld-007", "ld-013", "ld-015", "ld-016"],
    schedule: {
      timezone: "America/New_York",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      windowStart: "09:00",
      windowEnd: "12:00",
      dailyCap: 20,
    },
    createdAt: "2026-06-08T09:00:00Z",
    stats: { sent: 0, opened: 0, replied: 0, booked: 0 },
  },
];

// ---------------------------------------------------------------------------
// Outreach logs (most recent first)
// ---------------------------------------------------------------------------

export const outreachLogs: OutreachLog[] = [
  {
    id: "log-020",
    leadId: "ld-002",
    campaignId: "cmp-003",
    channel: "email",
    status: "replied",
    at: "2026-06-09T15:42:00Z",
    copy: "Re: fewer no-shows at Brightside — booked for Thursday 2pm.",
  },
  {
    id: "log-019",
    leadId: "ld-001",
    campaignId: "cmp-001",
    channel: "facebook",
    status: "replied",
    at: "2026-06-09T11:18:00Z",
    copy: "Hey Marcus — sent you an email last week about the missed-call thing. Storm season's coming; happy to show you how Hale Roofing could auto-book inspections. Worth a look?",
  },
  {
    id: "log-018",
    leadId: "ld-010",
    campaignId: "cmp-002",
    channel: "linkedin",
    status: "opened",
    at: "2026-06-09T09:30:00Z",
    copy: "Maria — saw your note about weekend Zillow leads going cold. We build AI agents that respond in under a minute, any hour. How are you covering Saturdays right now?",
  },
  {
    id: "log-017",
    leadId: "ld-017",
    campaignId: "cmp-001",
    channel: "email",
    status: "sent",
    at: "2026-06-08T16:05:00Z",
    copy: "Subject: Toth Plumbing's after-hours calls\n\nJason — when a pipe bursts at 11pm, whoever answers first gets the job...",
  },
  {
    id: "log-016",
    leadId: "ld-018",
    campaignId: "cmp-002",
    channel: "linkedin",
    status: "sent",
    at: "2026-06-08T10:12:00Z",
    copy: "Alyssa — your outbound tooling thread hit home. Curious what you landed on for personalization at scale?",
  },
  {
    id: "log-015",
    leadId: "ld-005",
    campaignId: "cmp-001",
    channel: "instagram",
    status: "sent",
    at: "2026-06-07T14:50:00Z",
    copy: "Derek — 22k followers and no win-back automation? Leaving money on the table 👀 quick idea for Ironline if you're open.",
  },
  {
    id: "log-014",
    leadId: "ld-009",
    campaignId: "cmp-002",
    channel: "email",
    status: "opened",
    at: "2026-06-06T09:00:00Z",
    copy: "Subject: re: that ops coordinator search\n\nDavid — hiring two coordinators usually means process strain...",
  },
  {
    id: "log-013",
    leadId: "ld-004",
    campaignId: "cmp-001",
    channel: "email",
    status: "opened",
    at: "2026-06-05T13:30:00Z",
    copy: "Subject: Moss & Vine intake, minus the wait\n\nAngela — your reviews are stellar except one thread: intake response time...",
  },
  {
    id: "log-012",
    leadId: "ld-008",
    campaignId: "cmp-002",
    channel: "email",
    status: "replied",
    at: "2026-06-04T17:25:00Z",
    copy: "Subject: the client reporting thing\n\nRachel — saw your post about reporting eating your team's Fridays...",
  },
  {
    id: "log-011",
    leadId: "ld-003",
    campaignId: "cmp-001",
    channel: "facebook",
    status: "sent",
    at: "2026-06-04T11:00:00Z",
    copy: "Tom — emailed you Monday about after-hours dispatch. 14 trucks is a lot to coordinate on spreadsheets. Got 10 minutes this week?",
  },
  {
    id: "log-010",
    leadId: "ld-011",
    campaignId: "cmp-002",
    channel: "linkedin",
    status: "sent",
    at: "2026-06-03T15:45:00Z",
    copy: "Chris — saw you asking for SDR tooling recs. Before you hire 12 more reps, worth seeing what an AI follow-up layer does for close rates.",
  },
  {
    id: "log-009",
    leadId: "ld-002",
    campaignId: "cmp-003",
    channel: "instagram",
    status: "opened",
    at: "2026-06-02T10:20:00Z",
    copy: "Dr. Natarajan — your smile transformations are unreal. Quick q about the waitlist 👇",
  },
  {
    id: "log-008",
    leadId: "ld-010",
    campaignId: "cmp-002",
    channel: "linkedin",
    status: "sent",
    at: "2026-06-01T09:15:00Z",
    copy: "Maria — 24 agents and weekend leads going cold. There's a fix that doesn't involve hiring an ISA.",
  },
  {
    id: "log-007",
    leadId: "ld-001",
    campaignId: "cmp-001",
    channel: "email",
    status: "opened",
    at: "2026-06-01T08:30:00Z",
    copy: "Subject: Hale Roofing's missed calls during storm season\n\nMarcus — 310 five-star reviews says the work sells itself. The calls you miss don't...",
  },
  {
    id: "log-006",
    leadId: "ld-009",
    campaignId: "cmp-002",
    channel: "linkedin",
    status: "sent",
    at: "2026-05-30T14:00:00Z",
    copy: "David — noticed Strand is hiring ops coordinators. Usually that means the process is outgrowing the team. What's the biggest bottleneck right now?",
  },
  {
    id: "log-005",
    leadId: "ld-012",
    campaignId: "cmp-003",
    channel: "email",
    status: "opened",
    at: "2026-05-30T09:45:00Z",
    copy: "Subject: DMs booking themselves at Petrova\n\nNina — owners answering IG DMs between treatments is the #1 thing we hear from med spas...",
  },
  {
    id: "log-004",
    leadId: "ld-008",
    campaignId: "cmp-002",
    channel: "linkedin",
    status: "opened",
    at: "2026-05-28T16:10:00Z",
    copy: "Rachel — that reporting post resonated. We build AI agents that draft client reports from raw analytics. How's Lumen handling it today?",
  },
  {
    id: "log-003",
    leadId: "ld-002",
    campaignId: "cmp-003",
    channel: "email",
    status: "opened",
    at: "2026-05-29T11:00:00Z",
    copy: "Subject: fewer no-shows at Brightside\n\nDr. Natarajan — phone-only scheduling with a cosmetic waitlist is a great problem to have...",
  },
  {
    id: "log-002",
    leadId: "ld-014",
    campaignId: "cmp-002",
    channel: "email",
    status: "replied",
    at: "2026-05-28T10:30:00Z",
    copy: "Subject: tax season automation\n\nFelicia — (marked not interested: 'all set with current systems, thanks')",
  },
  {
    id: "log-001",
    leadId: "ld-003",
    campaignId: "cmp-001",
    channel: "email",
    status: "opened",
    at: "2026-05-28T09:00:00Z",
    copy: "Subject: 14 trucks, zero missed calls\n\nTom — every missed after-hours call is a job your competitor books instead...",
  },
];

// ---------------------------------------------------------------------------
// AI copy cache
// ---------------------------------------------------------------------------

export const aiCopy: AiCopy[] = [
  {
    leadId: "ld-001",
    channel: "email",
    subject: "Hale Roofing's missed calls during storm season",
    body: "Marcus —\n\n310 five-star reviews says the work sells itself. The calls you miss while crews are on roofs don't.\n\nWe build AI receptionists for contractors: every call answered, inspections booked straight to your calendar, storm-season surge included.\n\nWorth 10 minutes this week?\n\n— Nate, King Circle AI",
    generatedAt: "2026-05-31T08:00:00Z",
  },
  {
    leadId: "ld-001",
    channel: "facebook",
    body: "Hey Marcus — sent you an email last week about the missed-call thing. Storm season's coming; happy to show you how Hale Roofing could auto-book inspections. Worth a look?",
    generatedAt: "2026-05-31T08:00:00Z",
  },
  {
    leadId: "ld-001",
    channel: "instagram",
    body: "Marcus — your crew's tear-off video was 🔥. Quick idea for catching the calls you're missing during jobs — open to it?",
    generatedAt: "2026-05-31T08:01:00Z",
  },
  {
    leadId: "ld-001",
    channel: "linkedin",
    body: "Marcus — central Ohio roofing is about to hit storm season. We help contractors catch every inbound call with AI. How are you handling overflow today?",
    generatedAt: "2026-05-31T08:01:00Z",
  },
  {
    leadId: "ld-008",
    channel: "email",
    subject: "the client reporting thing",
    body: "Rachel —\n\nSaw your post about reporting eating your team's Fridays. Twelve people, every client wanting a custom deck — that math never works.\n\nWe build AI agents that draft client reports from raw analytics in your voice and templates. One agency cut reporting time 80%.\n\n15-minute walkthrough?\n\n— Nate, King Circle AI",
    generatedAt: "2026-06-03T09:00:00Z",
  },
  {
    leadId: "ld-008",
    channel: "linkedin",
    body: "Rachel — that reporting post resonated. We build AI agents that draft client reports from raw analytics. How's Lumen handling it today?",
    generatedAt: "2026-06-03T09:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Call scripts (Claude-generated, cached like ai_copy)
// ---------------------------------------------------------------------------

export const callScripts: CallScript[] = [
  {
    leadId: "ld-001",
    opener:
      "Hi Marcus, this is Nate with King Circle AI — I'll be quick. I came across Hale Roofing while looking at top-rated contractors in Columbus. 310 five-star reviews is no joke. Did I catch you between jobs?",
    valueProp:
      "We build AI receptionists for roofing companies. Every call gets answered — even when your crews are on roofs — and inspections get booked straight onto your calendar. With storm season coming, that's usually 5–10 extra jobs a month you're currently missing.",
    questions: [
      "When a call comes in mid-job right now, what happens to it?",
      "Roughly how many calls a week would you guess go to voicemail?",
      "Who handles scheduling when you're slammed after a storm?",
    ],
    close:
      "Tell you what — I can show you exactly how it'd answer a Hale Roofing call in a 10-minute screen share. Would Thursday morning or Friday afternoon be easier?",
    generatedAt: "2026-06-02T09:00:00Z",
  },
  {
    leadId: "ld-003",
    opener:
      "Hi Tom, Nate with King Circle AI. I know summer's your crunch season so I'll keep this under a minute — it's about the after-hours calls Reicher might be missing.",
    valueProp:
      "We set up AI dispatch assistants for HVAC companies: after-hours calls answered, emergencies triaged, and jobs slotted against your trucks' availability instead of a spreadsheet. Fourteen trucks is exactly the size where this pays for itself in a week.",
    questions: [
      "What happens today when someone calls at 9pm with a dead AC?",
      "Is dispatch still running on spreadsheets, or have you moved to software?",
      "How many emergency calls do you think slip to competitors overnight?",
    ],
    close:
      "I'd love to run one of your real after-hours scenarios through it live. Got 15 minutes early next week — Monday or Tuesday before the day heats up?",
    generatedAt: "2026-06-02T09:05:00Z",
  },
  {
    leadId: "ld-010",
    opener:
      "Hi Maria, this is Nate from King Circle AI. I saw your note about weekend Zillow leads going cold — that's literally the problem we fix, so I figured a call beat another email.",
    valueProp:
      "We build AI lead-response agents for brokerages: every Zillow or site inquiry gets a personalized response in under a minute, any hour, and hot leads get routed to whichever of your 24 agents is on duty. Speed-to-lead is the whole game and you'd never lose a weekend lead again.",
    questions: [
      "What's your current response time on a Saturday afternoon inquiry?",
      "Do agents rotate weekend coverage, or is it ad hoc?",
      "Have you priced out an ISA team before?",
    ],
    close:
      "Easiest next step: I'll send a test inquiry through your own Zillow listing on a live call and you watch the AI respond. Fifteen minutes — would Wednesday work?",
    generatedAt: "2026-06-02T09:10:00Z",
  },
];

// ---------------------------------------------------------------------------
// Lookups & helpers
// ---------------------------------------------------------------------------

export function getSegment(id: string): Segment | undefined {
  return segments.find((s) => s.id === id);
}

export function getLeadsForSegment(segmentId: string): Lead[] {
  return leads.filter((l) => l.segmentId === segmentId);
}

export function getSequencesForSegment(segmentId: string): Sequence[] {
  return sequences.filter((s) => s.segmentId === segmentId);
}

export function getCallScript(leadId: string): CallScript | undefined {
  return callScripts.find((c) => c.leadId === leadId);
}

export function getLead(id: string): Lead | undefined {
  return leads.find((l) => l.id === id);
}

export function getSequence(id: string): Sequence | undefined {
  return sequences.find((s) => s.id === id);
}

export function getCampaignsForLead(leadId: string): Campaign[] {
  return campaigns.filter((c) => c.leadIds.includes(leadId));
}

export function getLogsForLead(leadId: string): OutreachLog[] {
  return outreachLogs.filter((l) => l.leadId === leadId);
}

export function getCopyForLead(leadId: string): AiCopy[] {
  return aiCopy.filter((c) => c.leadId === leadId);
}

export const channelLabels: Record<Channel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
};

export const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  enriched: "Enriched",
  in_sequence: "In Sequence",
  contacted: "Contacted",
  replied: "Replied",
  booked: "Booked",
  not_interested: "Not Interested",
};

export const sourceLabels: Record<LeadSource, string> = {
  google_maps: "Google Maps",
  linkedin: "LinkedIn",
  manual: "Manual",
};

// Daily send counts for the analytics chart (last 14 days)
export const dailySends: { date: string; email: number; dm: number }[] = [
  { date: "May 27", email: 2, dm: 1 },
  { date: "May 28", email: 4, dm: 2 },
  { date: "May 29", email: 3, dm: 1 },
  { date: "May 30", email: 2, dm: 3 },
  { date: "May 31", email: 1, dm: 0 },
  { date: "Jun 1", email: 3, dm: 2 },
  { date: "Jun 2", email: 1, dm: 2 },
  { date: "Jun 3", email: 2, dm: 3 },
  { date: "Jun 4", email: 3, dm: 2 },
  { date: "Jun 5", email: 2, dm: 1 },
  { date: "Jun 6", email: 1, dm: 0 },
  { date: "Jun 7", email: 0, dm: 2 },
  { date: "Jun 8", email: 3, dm: 1 },
  { date: "Jun 9", email: 2, dm: 2 },
];
