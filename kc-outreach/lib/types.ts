// Shared domain types + label maps. UI components consume the nested shapes
// (Lead.enrichment, Sequence.steps, Campaign.schedule/stats); lib/mappers.ts
// converts to/from the relational Supabase rows defined at the bottom.

export type Channel = "email" | "linkedin" | "facebook" | "instagram";

/** Channels stored in ai_copy_cache — includes call scripts. */
export type CopyChannel = Channel | "call";

export type LeadSource = "google_maps" | "linkedin" | "manual" | "scraped" | "social";

export type LeadStatus =
  | "new"
  | "enriched"
  | "in_sequence"
  | "contacted"
  | "replied"
  | "booked"
  | "not_interested";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type CampaignLeadStatus =
  | "pending"
  | "in_progress"
  | "replied"
  | "completed"
  | "stopped";

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type TouchStatus =
  | "scheduled"
  | "pending_integration"
  | "sent"
  | "opened"
  | "replied"
  | "failed"
  | "skipped";

export type CopySource = "claude" | "instantly" | "static";

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
  /** Domain as the scrape found it. Distinct from enrichment.website, which Exa inferred. */
  website?: string;
  linkedinUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  location: string;
  source: LeadSource;
  status: LeadStatus;
  segmentId: string | null;
  /** Set when the lead came in through a social post's landing page. */
  sourcePostId?: string;
  createdAt: string;
  enrichment?: Enrichment;
}

export interface SequenceStep {
  id: string;
  stepOrder: number;
  delayDays: number;
  channel: Channel;
  copySource: CopySource;
  templatePrompt: string;
  subjectTemplate: string;
  bodyTemplate: string;
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
// Label maps
// ---------------------------------------------------------------------------

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
  scraped: "Scraped",
  social: "Social",
};

export const copySourceLabels: Record<CopySource, string> = {
  claude: "Claude (AI per lead)",
  instantly: "Instantly variables",
  static: "Static template",
};

// ---------------------------------------------------------------------------
// Supabase row shapes (snake_case, as returned by supabase-js)
// ---------------------------------------------------------------------------

export interface SegmentRow {
  id: string;
  name: string;
  description: string;
  criteria: string[];
  created_at: string;
}

export interface LeadRow {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  location: string;
  source: LeadSource;
  status: LeadStatus;
  segment_id: string | null;
  source_post_id?: string | null;
  created_at: string;
}

export interface LeadEnrichmentRow {
  id: string;
  lead_id: string;
  summary: string;
  industry: string;
  company_size: string;
  website: string;
  signals: string[];
  exa_data: unknown;
  enriched_at: string;
}

export interface SequenceRow {
  id: string;
  name: string;
  description: string;
  segment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceStepRow {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  channel: Channel;
  copy_source: CopySource;
  template_prompt: string | null;
  subject_template: string | null;
  body_template: string | null;
  created_at: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  sequence_id: string;
  status: CampaignStatus;
  timezone: string;
  send_days: string[];
  window_start: string;
  window_end: string;
  daily_cap: number;
  instantly_ids: Record<string, unknown>;
  created_at: string;
  launched_at: string | null;
  completed_at: string | null;
}

export interface CampaignLeadRow {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: CampaignLeadStatus;
  current_step_order: number;
  next_send_at: string | null;
  last_sent_at: string | null;
  replied_at: string | null;
  stopped_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface OutreachLogRow {
  id: string;
  campaign_lead_id: string | null;
  campaign_id: string;
  lead_id: string;
  step_id: string | null;
  channel: Channel;
  status: TouchStatus;
  subject: string | null;
  body: string | null;
  external_id: string | null;
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface AiCopyCacheRow {
  id: string;
  lead_id: string;
  step_id: string | null;
  channel: CopyChannel;
  subject: string | null;
  body: string | null;
  payload: {
    opener?: string;
    valueProp?: string;
    questions?: string[];
    close?: string;
  } | null;
  model: string;
  generated_at: string;
}

export interface IntegrationRow {
  id: string;
  name: string;
  api_key: string | null;
  meta: Record<string, unknown>;
  updated_at: string;
}

// ── Phase 9: inbox + pipeline ───────────────────────────────────────────────

export type DealStage = "new_reply" | "qualified" | "meeting_booked" | "proposal" | "won" | "lost";

export const dealStages: DealStage[] = [
  "new_reply",
  "qualified",
  "meeting_booked",
  "proposal",
  "won",
  "lost",
];

export const dealStageLabels: Record<DealStage, string> = {
  new_reply: "New Reply",
  qualified: "Qualified",
  meeting_booked: "Meeting Booked",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export interface InboxMessage {
  id: string;
  leadId: string;
  direction: "inbound" | "outbound";
  channel: string;
  subject: string;
  body: string;
  occurredAt: string;
  readAt: string | null;
  classification: string | null;
}

export interface InboxThread {
  leadId: string;
  leadName: string;
  company: string;
  email: string;
  messages: InboxMessage[]; // oldest first
  unread: number;
  lastAt: string;
  classification: string | null;
  dealStage: DealStage | null;
}

export interface Deal {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  stage: DealStage;
  value: number;
  nextStep: string;
  nextStepAt: string | null;
  lostReason: string | null;
  stageChangedAt: string;
}

// ── Phase 8: organic social posting ────────────────────────────────────────

/** Platforms the app publishes to. (tiktok rows may exist from 8.2; not published here.) */
export type SocialPlatform = "facebook" | "instagram" | "linkedin";

export type SocialPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export type SocialAccountStatus = "active" | "expired" | "error" | "disconnected";

export type SocialLinkType = "landing" | "custom" | "none";

export const socialPlatforms: SocialPlatform[] = ["facebook", "instagram", "linkedin"];

export const socialPlatformLabels: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

/** Hard caption/commentary limits per platform. */
export const socialCharLimits: Record<SocialPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
};

/** Safe-for-the-browser view of a connected account (never includes tokens). */
export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  externalId: string;
  name: string;
  handle: string | null;
  status: SocialAccountStatus;
  lastError: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
}

export interface SocialPostMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  landingViews: number;
  formSubmissions: number;
  leads: number;
}

export interface SocialPost {
  id: string;
  accountId: string | null;
  platform: SocialPlatform;
  status: SocialPostStatus;
  content: string;
  linkType: SocialLinkType;
  linkUrl: string | null;
  trackingCode: string;
  landingHeadline: string;
  landingBody: string;
  landingCta: string;
  segmentId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  permalink: string | null;
  error: string | null;
  metrics: SocialPostMetrics;
  metricsUpdatedAt: string | null;
  createdAt: string;
}

export interface SocialAccountRow {
  id: string;
  platform: SocialPlatform;
  external_id: string;
  name: string;
  handle: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: SocialAccountStatus;
  last_error: string | null;
  meta: Record<string, unknown>;
  connected_at: string;
  updated_at: string;
}

export interface SocialPostRow {
  id: string;
  account_id: string | null;
  platform: SocialPlatform;
  status: SocialPostStatus;
  content: string;
  link_type: SocialLinkType;
  link_url: string | null;
  tracking_code: string;
  landing_headline: string;
  landing_body: string;
  landing_cta: string;
  segment_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  permalink: string | null;
  error: string | null;
  attempts: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  metrics_updated_at: string | null;
  landing_views: number;
  form_submissions: number;
  created_at: string;
  updated_at: string;
}
