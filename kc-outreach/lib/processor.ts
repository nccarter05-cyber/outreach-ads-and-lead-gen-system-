import "server-only";
import { resolveCopy } from "./copy";
import { dispatchEmail, isConfigured } from "./instantly";
import { mapCampaign, mapLead, mapStep } from "./mappers";
import { supabase, unwrap } from "./supabase";
import type {
  CampaignLeadRow,
  CampaignRow,
  LeadEnrichmentRow,
  LeadRow,
  SequenceStepRow,
} from "./types";

// The follow-up automation engine. One tick:
//   for each active campaign, inside its send window, under its daily cap:
//     advance due campaign_leads to their next sequence step —
//     skip DM channels (later phase), stop on reply, email via Instantly
//     (or log pending_integration when no key exists).
// Invoked by the Vercel cron route and the "Run scheduler" button.

export interface TickResult {
  campaignsProcessed: number;
  sent: number;
  pendingIntegration: number;
  skipped: number;
  completed: number;
  stopped: number;
  failed: number;
  notes: string[];
}

interface LocalParts {
  weekday: string;
  time: string; // HH:MM
  dayStart: Date;
}

function localParts(now: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  // Start of the local day, expressed as a UTC instant: subtract the elapsed
  // local time-of-day from `now`. (Close enough for daily-cap accounting.)
  const elapsedMs =
    (Number(hour) * 60 + Number(parts.minute)) * 60_000 + (now.getTime() % 60_000);
  return {
    weekday: parts.weekday,
    time: `${hour}:${parts.minute}`,
    dayStart: new Date(now.getTime() - elapsedMs),
  };
}

const STOP_LEAD_STATUSES = new Set(["replied", "booked", "not_interested"]);

export async function runOutreachTick(now = new Date()): Promise<TickResult> {
  const result: TickResult = {
    campaignsProcessed: 0,
    sent: 0,
    pendingIntegration: 0,
    skipped: 0,
    completed: 0,
    stopped: 0,
    failed: 0,
    notes: [],
  };
  const db = supabase();
  const configured = await isConfigured();

  const campaigns = unwrap<CampaignRow[]>(
    await db.from("campaigns").select("*").eq("status", "active"),
  );

  for (const campaignRow of campaigns) {
    const local = localParts(now, campaignRow.timezone);
    if (!campaignRow.send_days.includes(local.weekday)) continue;
    const windowStart = campaignRow.window_start.slice(0, 5);
    const windowEnd = campaignRow.window_end.slice(0, 5);
    if (local.time < windowStart || local.time >= windowEnd) continue;

    result.campaignsProcessed += 1;

    const { count: sentToday } = await db
      .from("outreach_logs")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignRow.id)
      .in("status", ["sent", "opened", "replied", "pending_integration"])
      .gte("created_at", local.dayStart.toISOString());
    let budget = campaignRow.daily_cap - (sentToday ?? 0);
    if (budget <= 0) {
      result.notes.push(`${campaignRow.name}: daily cap reached`);
      continue;
    }

    const stepRows = unwrap<SequenceStepRow[]>(
      await db
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", campaignRow.sequence_id)
        .order("step_order"),
    );
    const steps = stepRows.map(mapStep);

    const due = unwrap<
      (CampaignLeadRow & { leads: LeadRow & { lead_enrichments: LeadEnrichmentRow | null } })[]
    >(
      await db
        .from("campaign_leads")
        .select("*, leads(*, lead_enrichments(*))")
        .eq("campaign_id", campaignRow.id)
        .in("status", ["pending", "in_progress"])
        .is("replied_at", null)
        .or(`next_send_at.is.null,next_send_at.lte.${now.toISOString()}`)
        .order("next_send_at", { ascending: true, nullsFirst: true })
        .limit(budget * 3),
    );

    // Rebuild the UI-shaped campaign once for dispatch calls
    const campaign = mapCampaign(campaignRow, [], { sent: 0, opened: 0, replied: 0, booked: 0 });

    for (const cl of due) {
      if (budget <= 0) break;
      const lead = mapLead(cl.leads, cl.leads.lead_enrichments);

      if (STOP_LEAD_STATUSES.has(lead.status)) {
        await db
          .from("campaign_leads")
          .update({ status: "stopped", stopped_reason: `lead_status:${lead.status}` })
          .eq("id", cl.id);
        result.stopped += 1;
        continue;
      }

      const step = steps.find((s) => s.stepOrder === cl.current_step_order + 1);
      if (!step) {
        await db
          .from("campaign_leads")
          .update({ status: "completed", completed_at: now.toISOString() })
          .eq("id", cl.id);
        result.completed += 1;
        continue;
      }

      const advance = async () => {
        const next = steps.find((s) => s.stepOrder === step.stepOrder + 1);
        await db
          .from("campaign_leads")
          .update({
            current_step_order: step.stepOrder,
            status: next ? "in_progress" : "completed",
            last_sent_at: now.toISOString(),
            started_at: cl.started_at ?? now.toISOString(),
            next_send_at: next
              ? new Date(now.getTime() + next.delayDays * 86_400_000).toISOString()
              : null,
            completed_at: next ? null : now.toISOString(),
          })
          .eq("id", cl.id);
        if (!next) result.completed += 1;
      };

      if (step.channel !== "email") {
        // DM channels ship in the social phase; skip without consuming budget.
        await db.from("outreach_logs").insert({
          campaign_lead_id: cl.id,
          campaign_id: campaignRow.id,
          lead_id: lead.id,
          step_id: step.id,
          channel: step.channel,
          status: "skipped",
          error: "channel_not_yet_supported",
        });
        await advance();
        result.skipped += 1;
        continue;
      }

      if (!lead.email) {
        await db.from("outreach_logs").insert({
          campaign_lead_id: cl.id,
          campaign_id: campaignRow.id,
          lead_id: lead.id,
          step_id: step.id,
          channel: "email",
          status: "skipped",
          error: "lead_has_no_email",
        });
        await advance();
        result.skipped += 1;
        continue;
      }

      let copy;
      try {
        copy = await resolveCopy({ lead, step });
      } catch (e) {
        await db.from("outreach_logs").insert({
          campaign_lead_id: cl.id,
          campaign_id: campaignRow.id,
          lead_id: lead.id,
          step_id: step.id,
          channel: "email",
          status: "failed",
          error: `copy_generation: ${e instanceof Error ? e.message : String(e)}`,
        });
        // Don't advance; retry in an hour instead of hot-looping.
        await db
          .from("campaign_leads")
          .update({ next_send_at: new Date(now.getTime() + 3_600_000).toISOString() })
          .eq("id", cl.id);
        result.failed += 1;
        continue;
      }

      if (configured) {
        try {
          const dispatch = await dispatchEmail({ campaign, lead, step, copy });
          await db.from("outreach_logs").insert({
            campaign_lead_id: cl.id,
            campaign_id: campaignRow.id,
            lead_id: lead.id,
            step_id: step.id,
            channel: "email",
            status: "sent",
            subject: copy.subject,
            body: copy.body,
            external_id: "externalId" in dispatch ? dispatch.externalId : null,
            sent_at: now.toISOString(),
          });
          result.sent += 1;
        } catch (e) {
          await db.from("outreach_logs").insert({
            campaign_lead_id: cl.id,
            campaign_id: campaignRow.id,
            lead_id: lead.id,
            step_id: step.id,
            channel: "email",
            status: "failed",
            subject: copy.subject,
            body: copy.body,
            error: `instantly_dispatch: ${e instanceof Error ? e.message : String(e)}`,
          });
          await db
            .from("campaign_leads")
            .update({ next_send_at: new Date(now.getTime() + 3_600_000).toISOString() })
            .eq("id", cl.id);
          result.failed += 1;
          continue;
        }
      } else {
        // Key-ready degradation: copy is generated and persisted, nothing sent.
        await db.from("outreach_logs").insert({
          campaign_lead_id: cl.id,
          campaign_id: campaignRow.id,
          lead_id: lead.id,
          step_id: step.id,
          channel: "email",
          status: "pending_integration",
          subject: copy.subject,
          body: copy.body,
        });
        result.pendingIntegration += 1;
      }

      await advance();
      if (lead.status === "new" || lead.status === "enriched" || lead.status === "in_sequence") {
        await db.from("leads").update({ status: "contacted" }).eq("id", lead.id);
      }
      budget -= 1;
    }
  }

  return result;
}
