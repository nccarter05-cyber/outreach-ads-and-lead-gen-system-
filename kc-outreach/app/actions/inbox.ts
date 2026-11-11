"use server";

import { revalidatePath } from "next/cache";
import { generateReplyDraft } from "@/lib/claude";
import { pollInbox } from "@/lib/imap";
import { moveDeal, sendReply } from "@/lib/inbox";
import { mapLead } from "@/lib/mappers";
import { supabase, unwrap } from "@/lib/supabase";
import type { DealStage, LeadEnrichmentRow, LeadRow } from "@/lib/types";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

export async function markThreadRead(leadId: string): Promise<void> {
  await supabase()
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .is("read_at", null);
  revalidatePath("/inbox");
}

export async function draftReply(
  leadId: string,
): Promise<{ ok: boolean; subject?: string; body?: string; error?: string }> {
  try {
    const db = supabase();
    const row = unwrap<LeadRow & { lead_enrichments: LeadEnrichmentRow | null }>(
      await db.from("leads").select("*, lead_enrichments(*)").eq("id", leadId).single(),
    );
    const msgs = unwrap<{ direction: "inbound" | "outbound"; body: string }[]>(
      await db
        .from("messages")
        .select("direction, body")
        .eq("lead_id", leadId)
        .order("occurred_at", { ascending: false })
        .limit(6),
    );
    const lead = mapLead(row, row.lead_enrichments);
    const draft = await generateReplyDraft({
      lead,
      enrichment: lead.enrichment,
      thread: msgs.reverse(),
    });
    return { ok: true, ...draft };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function sendInboxReply(input: {
  leadId: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; pending?: boolean; error?: string }> {
  try {
    const res = await sendReply(input);
    refresh();
    return { ok: res.sent, pending: res.pending };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function moveDealStage(
  dealId: string,
  stage: DealStage,
  lostReason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await moveDeal(dealId, stage, lostReason);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function updateDeal(
  dealId: string,
  patch: { value?: number; nextStep?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const update: Record<string, unknown> = {};
    if (patch.value !== undefined) update.value = patch.value;
    if (patch.nextStep !== undefined) update.next_step = patch.nextStep;
    const { error } = await supabase().from("deals").update(update).eq("id", dealId);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function checkReplies(): Promise<{
  ok: boolean;
  scanned?: number;
  stored?: number;
  error?: string;
}> {
  try {
    const res = await pollInbox();
    refresh();
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
