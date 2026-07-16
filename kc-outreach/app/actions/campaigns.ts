"use server";

import { revalidatePath } from "next/cache";
import { ensureCampaignScaffolding, setInstantlyCampaignStatus } from "@/lib/instantly";
import { mapCampaign, mapStep } from "@/lib/mappers";
import { supabase, unwrap } from "@/lib/supabase";
import type { CampaignRow, CampaignSchedule, SequenceStepRow } from "@/lib/types";

export type LeadSelection = "all" | "new" | "enriched" | { ids: string[] };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function revalidateCampaignPaths() {
  revalidatePath("/campaigns");
  revalidatePath("/");
}

async function scaffold(campaignRow: CampaignRow) {
  const steps = unwrap<SequenceStepRow[]>(
    await supabase()
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", campaignRow.sequence_id)
      .order("step_order"),
  );
  await ensureCampaignScaffolding(
    mapCampaign(campaignRow, [], { sent: 0, opened: 0, replied: 0, booked: 0 }),
    steps.map(mapStep),
  );
}

export async function createCampaign(input: {
  name: string;
  sequenceId: string;
  leadSelection: LeadSelection;
  schedule: CampaignSchedule;
  launch: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = supabase();
  try {
    let leadIds: string[];
    if (typeof input.leadSelection === "object") {
      leadIds = input.leadSelection.ids;
    } else {
      let query = db.from("leads").select("id");
      if (input.leadSelection === "new") query = query.eq("status", "new");
      if (input.leadSelection === "enriched") query = query.eq("status", "enriched");
      leadIds = unwrap<{ id: string }[]>(await query).map((r) => r.id);
    }
    if (leadIds.length === 0) {
      return { ok: false, error: "No leads match the selection." };
    }

    const now = new Date().toISOString();
    const created = unwrap<CampaignRow[]>(
      await db
        .from("campaigns")
        .insert({
          name: input.name,
          sequence_id: input.sequenceId,
          status: input.launch ? "active" : "draft",
          timezone: input.schedule.timezone,
          send_days: input.schedule.days,
          window_start: input.schedule.windowStart,
          window_end: input.schedule.windowEnd,
          daily_cap: input.schedule.dailyCap,
          launched_at: input.launch ? now : null,
        })
        .select("*"),
    );
    const campaign = created[0];

    unwrap(
      await db
        .from("campaign_leads")
        .insert(leadIds.map((leadId) => ({ campaign_id: campaign.id, lead_id: leadId })))
        .select("id"),
    );
    await db
      .from("leads")
      .update({ status: "in_sequence" })
      .in("id", leadIds)
      .in("status", ["new", "enriched"]);

    if (input.launch) {
      await scaffold(campaign);
    }
    revalidateCampaignPaths();
    revalidatePath("/leads");
    return { ok: true, id: campaign.id };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function setCampaignStatus(
  id: string,
  status: "active" | "paused",
): Promise<{ ok: boolean; error?: string }> {
  const db = supabase();
  try {
    const row = unwrap<CampaignRow | null>(
      await db.from("campaigns").select("*").eq("id", id).maybeSingle(),
    );
    if (!row) return { ok: false, error: "Campaign not found" };

    unwrap(
      await db
        .from("campaigns")
        .update({
          status,
          launched_at: row.launched_at ?? (status === "active" ? new Date().toISOString() : null),
        })
        .eq("id", id)
        .select("id"),
    );

    if (status === "active") {
      await scaffold({ ...row, status: "active" });
      await setInstantlyCampaignStatus(row.instantly_ids, "activate");
    } else {
      await setInstantlyCampaignStatus(row.instantly_ids, "pause");
    }
    revalidateCampaignPaths();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function addLeadToCampaign(
  campaignId: string,
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = supabase();
  try {
    const { error } = await db
      .from("campaign_leads")
      .insert({ campaign_id: campaignId, lead_id: leadId });
    if (error && !error.message.includes("duplicate key")) {
      return { ok: false, error: error.message };
    }
    await db
      .from("leads")
      .update({ status: "in_sequence" })
      .eq("id", leadId)
      .in("status", ["new", "enriched"]);
    revalidateCampaignPaths();
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function deleteCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    unwrap(await supabase().from("campaigns").delete().eq("id", id).select("id"));
    revalidateCampaignPaths();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
