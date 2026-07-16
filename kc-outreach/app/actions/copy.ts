"use server";

import { revalidatePath } from "next/cache";
import { generateCallScript, generateEmailCopy } from "@/lib/claude";
import { mapLead } from "@/lib/mappers";
import { supabase, unwrap } from "@/lib/supabase";
import type { Channel, LeadEnrichmentRow, LeadRow } from "@/lib/types";

type LeadWithEnrichment = LeadRow & { lead_enrichments: LeadEnrichmentRow | null };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchLead(id: string) {
  const row = unwrap<LeadWithEnrichment | null>(
    await supabase()
      .from("leads")
      .select("*, lead_enrichments(*)")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!row) throw new Error("Lead not found");
  return mapLead(row, row.lead_enrichments);
}

/** Replaces any cached row at (lead_id, channel/step) — partial unique indexes can't be upserted via PostgREST. */
async function replaceCacheRow(
  leadId: string,
  channel: string,
  values: { subject?: string | null; body?: string | null; payload?: unknown },
) {
  const db = supabase();
  await db
    .from("ai_copy_cache")
    .delete()
    .eq("lead_id", leadId)
    .eq("channel", channel)
    .is("step_id", null);
  unwrap(
    await db
      .from("ai_copy_cache")
      .insert({ lead_id: leadId, step_id: null, channel, ...values })
      .select("id"),
  );
}

const CHANNEL_PROMPTS: Record<Channel, string> = {
  email:
    "Cold intro email. Reference one specific detail about their business from the research. Clear value proposition for how King Circle AI could help them. One-line CTA for a 10-minute call.",
  linkedin:
    "Conversational LinkedIn DM opener. Reference a signal from the research. No hard pitch — end with a genuine question about their workflow. Under 60 words.",
  facebook:
    "Casual Facebook DM. One concrete benefit tied to their business type. Friendly, not salesy. Under 50 words.",
  instagram: "Very short Instagram DM with a curiosity hook. Under 30 words.",
};

export async function generateChannelCopy(
  leadId: string,
  channel: Channel,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const lead = await fetchLead(leadId);
    const copy = await generateEmailCopy({
      lead,
      enrichment: lead.enrichment,
      prompt: CHANNEL_PROMPTS[channel],
      channel,
    });
    await replaceCacheRow(leadId, channel, { subject: copy.subject || null, body: copy.body });
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function generateCallScriptForLead(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const lead = await fetchLead(leadId);
    const script = await generateCallScript({ lead, enrichment: lead.enrichment });
    await replaceCacheRow(leadId, "call", { payload: script });
    revalidatePath("/calls");
    revalidatePath(`/leads/${leadId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Generates call scripts for phone-reachable leads that don't have one yet. */
export async function generateMissingScripts(
  segmentId?: string,
): Promise<{ ok: boolean; generated: number; failed: number; error?: string }> {
  const db = supabase();
  let generated = 0;
  let failed = 0;
  try {
    let query = db
      .from("leads")
      .select("*, lead_enrichments(*)")
      .not("phone", "is", null)
      .not("status", "in", "(replied,booked,not_interested)");
    if (segmentId) query = query.eq("segment_id", segmentId);
    const rows = unwrap<LeadWithEnrichment[]>(await query);

    const withScripts = new Set(
      unwrap<{ lead_id: string }[]>(
        await db.from("ai_copy_cache").select("lead_id").eq("channel", "call"),
      ).map((r) => r.lead_id),
    );

    for (const row of rows) {
      if (withScripts.has(row.id)) continue;
      try {
        const lead = mapLead(row, row.lead_enrichments);
        const script = await generateCallScript({ lead, enrichment: lead.enrichment });
        await replaceCacheRow(row.id, "call", { payload: script });
        generated += 1;
      } catch {
        failed += 1;
      }
    }
    revalidatePath("/calls");
    return { ok: failed === 0, generated, failed };
  } catch (e) {
    return { ok: false, generated, failed, error: errMsg(e) };
  }
}
