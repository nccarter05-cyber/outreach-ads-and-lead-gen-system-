import type {
  AiCopy,
  AiCopyCacheRow,
  CallScript,
  Campaign,
  CampaignRow,
  Enrichment,
  Lead,
  LeadEnrichmentRow,
  LeadRow,
  OutreachLog,
  OutreachLogRow,
  Segment,
  SegmentRow,
  Sequence,
  SequenceRow,
  SequenceStep,
  SequenceStepRow,
  Weekday,
} from "./types";

export function mapSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    criteria: row.criteria ?? [],
  };
}

export function mapEnrichment(row: LeadEnrichmentRow): Enrichment {
  return {
    summary: row.summary,
    industry: row.industry,
    companySize: row.company_size,
    website: row.website,
    signals: row.signals ?? [],
    enrichedAt: row.enriched_at,
  };
}

export function mapLead(row: LeadRow, enrichment?: LeadEnrichmentRow | null): Lead {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    title: row.title,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    linkedinUrl: row.linkedin_url ?? undefined,
    facebookUrl: row.facebook_url ?? undefined,
    instagramUrl: row.instagram_url ?? undefined,
    location: row.location,
    source: row.source,
    status: row.status,
    segmentId: row.segment_id,
    createdAt: row.created_at,
    enrichment: enrichment ? mapEnrichment(enrichment) : undefined,
  };
}

export function mapStep(row: SequenceStepRow): SequenceStep {
  return {
    id: row.id,
    stepOrder: row.step_order,
    delayDays: row.delay_days,
    channel: row.channel,
    copySource: row.copy_source,
    templatePrompt: row.template_prompt ?? "",
    subjectTemplate: row.subject_template ?? "",
    bodyTemplate: row.body_template ?? "",
  };
}

export function mapSequence(row: SequenceRow, steps: SequenceStepRow[]): Sequence {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    segmentId: row.segment_id ?? undefined,
    createdAt: row.created_at,
    steps: steps
      .slice()
      .sort((a, b) => a.step_order - b.step_order)
      .map(mapStep),
  };
}

/** HH:MM:SS (postgres time) → HH:MM for the UI. */
function toHhMm(time: string): string {
  return time.slice(0, 5);
}

export function mapCampaign(
  row: CampaignRow,
  leadIds: string[],
  stats: Campaign["stats"],
): Campaign {
  return {
    id: row.id,
    name: row.name,
    sequenceId: row.sequence_id,
    status: row.status,
    leadIds,
    schedule: {
      timezone: row.timezone,
      days: row.send_days as Weekday[],
      windowStart: toHhMm(row.window_start),
      windowEnd: toHhMm(row.window_end),
      dailyCap: row.daily_cap,
    },
    createdAt: row.created_at,
    stats,
  };
}

export function mapLog(row: OutreachLogRow): OutreachLog {
  return {
    id: row.id,
    leadId: row.lead_id,
    campaignId: row.campaign_id,
    channel: row.channel,
    status: row.status,
    at: row.sent_at ?? row.created_at,
    copy: row.subject ? `Subject: ${row.subject}\n\n${row.body ?? ""}` : (row.body ?? ""),
  };
}

export function mapAiCopy(row: AiCopyCacheRow): AiCopy {
  return {
    leadId: row.lead_id,
    channel: row.channel as AiCopy["channel"],
    subject: row.subject ?? undefined,
    body: row.body ?? "",
    generatedAt: row.generated_at,
  };
}

export function mapCallScript(row: AiCopyCacheRow): CallScript {
  const p = row.payload ?? {};
  return {
    leadId: row.lead_id,
    opener: p.opener ?? "",
    valueProp: p.valueProp ?? "",
    questions: p.questions ?? [],
    close: p.close ?? "",
    generatedAt: row.generated_at,
  };
}
