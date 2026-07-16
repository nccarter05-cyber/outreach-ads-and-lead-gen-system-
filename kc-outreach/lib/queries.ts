import "server-only";
import { supabase, unwrap } from "./supabase";
import {
  mapAiCopy,
  mapCallScript,
  mapCampaign,
  mapLead,
  mapLog,
  mapSegment,
  mapSequence,
} from "./mappers";
import type {
  AiCopy,
  AiCopyCacheRow,
  CallScript,
  Campaign,
  CampaignLeadRow,
  CampaignRow,
  Lead,
  LeadEnrichmentRow,
  LeadRow,
  OutreachLog,
  OutreachLogRow,
  Segment,
  SegmentRow,
  Sequence,
  SequenceRow,
  SequenceStepRow,
} from "./types";

type LeadWithEnrichment = LeadRow & { lead_enrichments: LeadEnrichmentRow | null };

export async function getSegments(): Promise<Segment[]> {
  const rows = unwrap<SegmentRow[]>(
    await supabase().from("segments").select("*").order("created_at"),
  );
  return rows.map(mapSegment);
}

export async function getLeads(): Promise<Lead[]> {
  const rows = unwrap<LeadWithEnrichment[]>(
    await supabase()
      .from("leads")
      .select("*, lead_enrichments(*)")
      .order("created_at", { ascending: false }),
  );
  return rows.map((r) => mapLead(r, r.lead_enrichments));
}

export async function getSequences(): Promise<Sequence[]> {
  const [seqRows, stepRows] = await Promise.all([
    supabase().from("sequences").select("*").order("created_at"),
    supabase().from("sequence_steps").select("*"),
  ]);
  const steps = unwrap<SequenceStepRow[]>(stepRows);
  return unwrap<SequenceRow[]>(seqRows).map((s) =>
    mapSequence(s, steps.filter((st) => st.sequence_id === s.id)),
  );
}

async function campaignStats(): Promise<{
  leadIdsByCampaign: Map<string, string[]>;
  statsByCampaign: Map<string, Campaign["stats"]>;
}> {
  const [clRes, logRes] = await Promise.all([
    supabase().from("campaign_leads").select("campaign_id, lead_id, leads(status)"),
    supabase()
      .from("outreach_logs")
      .select("campaign_id, status, sent_at, opened_at, replied_at"),
  ]);
  const cls = unwrap<(Pick<CampaignLeadRow, "campaign_id" | "lead_id"> & {
    leads: { status: string } | null;
  })[]>(clRes as never);
  const logs = unwrap<Pick<OutreachLogRow, "campaign_id" | "status" | "sent_at" | "opened_at" | "replied_at">[]>(
    logRes,
  );

  const leadIdsByCampaign = new Map<string, string[]>();
  const statsByCampaign = new Map<string, Campaign["stats"]>();
  const stat = (id: string) => {
    let s = statsByCampaign.get(id);
    if (!s) {
      s = { sent: 0, opened: 0, replied: 0, booked: 0 };
      statsByCampaign.set(id, s);
    }
    return s;
  };

  for (const cl of cls) {
    const ids = leadIdsByCampaign.get(cl.campaign_id) ?? [];
    ids.push(cl.lead_id);
    leadIdsByCampaign.set(cl.campaign_id, ids);
    if (cl.leads?.status === "booked") stat(cl.campaign_id).booked += 1;
  }
  for (const log of logs) {
    const s = stat(log.campaign_id);
    if (log.sent_at || log.status === "pending_integration") s.sent += 1;
    if (log.opened_at) s.opened += 1;
    if (log.replied_at) s.replied += 1;
  }
  return { leadIdsByCampaign, statsByCampaign };
}

export async function getCampaigns(): Promise<Campaign[]> {
  const [rowsRes, { leadIdsByCampaign, statsByCampaign }] = await Promise.all([
    supabase().from("campaigns").select("*").order("created_at", { ascending: false }),
    campaignStats(),
  ]);
  return unwrap<CampaignRow[]>(rowsRes).map((row) =>
    mapCampaign(
      row,
      leadIdsByCampaign.get(row.id) ?? [],
      statsByCampaign.get(row.id) ?? { sent: 0, opened: 0, replied: 0, booked: 0 },
    ),
  );
}

export async function getOutreachLogs(limit = 100): Promise<OutreachLog[]> {
  const rows = unwrap<OutreachLogRow[]>(
    await supabase()
      .from("outreach_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return rows.map(mapLog);
}

export async function getCallScripts(): Promise<CallScript[]> {
  const rows = unwrap<AiCopyCacheRow[]>(
    await supabase().from("ai_copy_cache").select("*").eq("channel", "call"),
  );
  return rows.map(mapCallScript);
}

export interface LeadDetail {
  lead: Lead;
  logs: OutreachLog[];
  copy: AiCopy[];
  callScript?: CallScript;
  campaigns: Campaign[];
  segment?: Segment;
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  const leadRes = await supabase()
    .from("leads")
    .select("*, lead_enrichments(*)")
    .eq("id", id)
    .maybeSingle();
  const row = unwrap<LeadWithEnrichment | null>(leadRes);
  if (!row) return null;

  const [logsRes, copyRes, clRes, segRes] = await Promise.all([
    supabase()
      .from("outreach_logs")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    supabase().from("ai_copy_cache").select("*").eq("lead_id", id),
    supabase().from("campaign_leads").select("campaign_id").eq("lead_id", id),
    row.segment_id
      ? supabase().from("segments").select("*").eq("id", row.segment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const copyRows = unwrap<AiCopyCacheRow[]>(copyRes);
  const campaignIds = unwrap<{ campaign_id: string }[]>(clRes).map((c) => c.campaign_id);
  const allCampaigns = campaignIds.length ? await getCampaigns() : [];
  const segRow = unwrap<SegmentRow | null>(segRes as never);

  const callRow = copyRows.find((c) => c.channel === "call");
  return {
    lead: mapLead(row, row.lead_enrichments),
    logs: unwrap<OutreachLogRow[]>(logsRes).map(mapLog),
    copy: copyRows.filter((c) => c.channel !== "call").map(mapAiCopy),
    callScript: callRow ? mapCallScript(callRow) : undefined,
    campaigns: allCampaigns.filter((c) => campaignIds.includes(c.id)),
    segment: segRow ? mapSegment(segRow) : undefined,
  };
}

export interface DailySend {
  date: string;
  email: number;
  dm: number;
}

export async function getDailySends(days = 14): Promise<DailySend[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);
  const rows = unwrap<Pick<OutreachLogRow, "channel" | "status" | "sent_at" | "created_at">[]>(
    await supabase()
      .from("outreach_logs")
      .select("channel, status, sent_at, created_at")
      .gte("created_at", cutoff.toISOString()),
  );

  const buckets = new Map<string, DailySend>();
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff);
    d.setDate(cutoff.getDate() + i);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    buckets.set(label, { date: label, email: 0, dm: 0 });
  }
  for (const row of rows) {
    const wasSent = row.sent_at !== null || row.status === "pending_integration";
    if (!wasSent) continue;
    const label = new Date(row.sent_at ?? row.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const bucket = buckets.get(label);
    if (!bucket) continue;
    if (row.channel === "email") bucket.email += 1;
    else bucket.dm += 1;
  }
  return [...buckets.values()];
}
