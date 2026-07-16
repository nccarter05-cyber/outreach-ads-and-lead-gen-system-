"use server";

import { revalidatePath } from "next/cache";
import { structureEnrichment } from "@/lib/claude";
import { enrichLead } from "@/lib/exa";
import { mapLead } from "@/lib/mappers";
import { supabase, unwrap } from "@/lib/supabase";
import type { LeadRow, LeadSource, LeadStatus } from "@/lib/types";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function createLead(input: {
  name: string;
  company: string;
  title: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  location: string;
  source?: LeadSource;
  segmentId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const rows = unwrap<{ id: string }[]>(
      await supabase()
        .from("leads")
        .insert({
          name: input.name,
          company: input.company,
          title: input.title,
          email: input.email || null,
          phone: input.phone || null,
          linkedin_url: input.linkedinUrl || null,
          facebook_url: input.facebookUrl || null,
          instagram_url: input.instagramUrl || null,
          location: input.location,
          source: input.source ?? "manual",
          segment_id: input.segmentId ?? null,
        })
        .select("id"),
    );
    revalidatePath("/leads");
    revalidatePath("/calls");
    return { ok: true, id: rows[0].id };
  } catch (e) {
    const msg = errMsg(e);
    return {
      ok: false,
      error: msg.includes("leads_email_unique") ? "A lead with this email already exists." : msg,
    };
  }
}

export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    unwrap(await supabase().from("leads").update({ status }).eq("id", id).select("id"));
    if (status === "replied" || status === "booked" || status === "not_interested") {
      // Stop-on-reply: halt any in-flight sequences for this lead.
      await supabase()
        .from("campaign_leads")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
          stopped_reason: `manual:${status}`,
        })
        .eq("lead_id", id)
        .in("status", ["pending", "in_progress"]);
    }
    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
    revalidatePath("/calls");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function enrichLeads(
  ids: string[],
): Promise<{ ok: boolean; enriched: number; failed: number; error?: string }> {
  const db = supabase();
  let enriched = 0;
  let failed = 0;
  try {
    const rows = unwrap<LeadRow[]>(await db.from("leads").select("*").in("id", ids));
    for (const row of rows) {
      try {
        const lead = mapLead(row);
        const raw = await enrichLead(lead);
        let structured = {
          summary: raw.summary,
          industry: raw.industry,
          companySize: raw.companySize,
          signals: raw.signals,
        };
        try {
          structured = await structureEnrichment({
            lead,
            rawText: JSON.stringify(raw.exaData).slice(0, 12000),
          });
        } catch {
          // Claude structuring is best-effort; raw Exa mapping still lands.
        }
        unwrap(
          await db
            .from("lead_enrichments")
            .upsert(
              {
                lead_id: row.id,
                summary: structured.summary,
                industry: structured.industry,
                company_size: structured.companySize,
                website: raw.website,
                signals: structured.signals,
                exa_data: raw.exaData,
                enriched_at: new Date().toISOString(),
              },
              { onConflict: "lead_id" },
            )
            .select("id"),
        );
        if (row.status === "new") {
          await db.from("leads").update({ status: "enriched" }).eq("id", row.id);
        }
        enriched += 1;
      } catch {
        failed += 1;
      }
    }
    revalidatePath("/leads");
    revalidatePath("/calls");
    for (const id of ids) revalidatePath(`/leads/${id}`);
    return { ok: failed === 0, enriched, failed };
  } catch (e) {
    return { ok: false, enriched, failed, error: errMsg(e) };
  }
}
