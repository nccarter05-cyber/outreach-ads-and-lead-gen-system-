// Shared domain types + label maps. UI components consume the nested shapes
// (Lead.enrichment, Sequence.steps, Campaign.schedule/stats); lib/mappers.ts
// converts to/from the relational Supabase rows defined at the bottom.

export type Channel = "email" | "linkedin" | "facebook" | "instagram";

/** Channels stored in ai_copy_cache — includes call scripts. */
export type CopyChannel = Channel | "call";

export type LeadSource = "google_maps" | "linkedin" | "manual" | "scraped";

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
  linkedinUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  location: string;
  source: LeadSource;
  status: LeadStatus;
  segmentId: string | null;
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
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  location: string;
  source: LeadSource;
  status: LeadStatus;
  segment_id: string | null;
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
