import "server-only";
import { notifyOwner, sendWarmEmail } from "./email";
import { addSuppression, isSuppressed } from "./suppressions";
import { supabase, unwrap } from "./supabase";

// Reply inbox + deal pipeline logic (Phase 9). Used by the Instantly webhook,
// the IMAP poller (SMTP replies) and the inbox/pipeline server actions.

export type DealStage = "new_reply" | "qualified" | "meeting_booked" | "proposal" | "won" | "lost";

const UNSUB_RE =
  /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don'?t (email|contact) me)\b/i;

/** Drop quoted history so only the new reply text is stored. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/i.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim())) break;
    if (/^>/.test(line.trim())) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export interface InboundArgs {
  email: string;
  subject?: string;
  body: string;
  externalId?: string;
  channel?: string;
  occurredAt?: string;
}

/** Store an inbound reply and sync lead / campaign / deal state. Idempotent on externalId. */
export async function ingestInbound(args: InboundArgs): Promise<{ stored: boolean; leadId?: string }> {
  const db = supabase();
  const email = args.email.trim().toLowerCase();
  const lead = unwrap<{ id: string; status: string } | null>(
    await db.from("leads").select("id, status").ilike("email", email).maybeSingle(),
  );
  if (!lead) return { stored: false };

  if (args.externalId) {
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("external_id", args.externalId);
    if ((count ?? 0) > 0) return { stored: false, leadId: lead.id };
  }

  const body = stripQuoted(args.body) || args.body.trim();
  const unsubscribe = UNSUB_RE.test(body);
  const cl = unwrap<{ id: string } | null>(
    await db
      .from("campaign_leads")
      .select("id")
      .eq("lead_id", lead.id)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  );

  await db.from("messages").insert({
    lead_id: lead.id,
    campaign_lead_id: cl?.id ?? null,
    channel: args.channel ?? "email",
    direction: "inbound",
    subject: args.subject ?? "",
    body,
    external_id: args.externalId ?? null,
    occurred_at: args.occurredAt ?? new Date().toISOString(),
    classification: unsubscribe ? "unsubscribe" : null,
  });

  // Stop all active sequences for this lead.
  await db
    .from("campaign_leads")
    .update({ status: "replied", replied_at: new Date().toISOString() })
    .eq("lead_id", lead.id)
    .in("status", ["pending", "in_progress"]);

  if (unsubscribe) {
    await addSuppression(email, "unsubscribed", lead.id);
    await db.from("leads").update({ status: "not_interested" }).eq("id", lead.id);
    return { stored: true, leadId: lead.id };
  }

  if (!["booked", "not_interested"].includes(lead.status)) {
    await db.from("leads").update({ status: "replied" }).eq("id", lead.id);
  }
  await ensureOpenDeal(lead.id);
  await notifyOwner(
    `Reply from ${email}`,
    `${email} replied:\n\n${body.slice(0, 600)}\n\nOpen the inbox: ${process.env.APP_URL ?? ""}/inbox`,
  ).catch(() => false);
  return { stored: true, leadId: lead.id };
}

async function ensureOpenDeal(leadId: string): Promise<void> {
  const db = supabase();
  const { count } = await db
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .not("stage", "in", "(won,lost)");
  if ((count ?? 0) > 0) return;
  const deal = unwrap<{ id: string }>(
    await db.from("deals").insert({ lead_id: leadId, stage: "new_reply" }).select("id").single(),
  );
  await db.from("deal_events").insert({ deal_id: deal.id, from_stage: null, to_stage: "new_reply" });
}

/** Move a deal and sync the lead's status (meeting_booked -> booked, lost -> not_interested). */
export async function moveDeal(dealId: string, stage: DealStage, lostReason?: string): Promise<void> {
  const db = supabase();
  const deal = unwrap<{ id: string; lead_id: string; stage: DealStage }>(
    await db.from("deals").select("id, lead_id, stage").eq("id", dealId).single(),
  );
  if (deal.stage === stage) return;
  await db
    .from("deals")
    .update({
      stage,
      stage_changed_at: new Date().toISOString(),
      lost_reason: stage === "lost" ? (lostReason ?? "") : null,
    })
    .eq("id", dealId);
  await db.from("deal_events").insert({ deal_id: dealId, from_stage: deal.stage, to_stage: stage });
  if (stage === "meeting_booked") {
    await db.from("leads").update({ status: "booked" }).eq("id", deal.lead_id);
  } else if (stage === "lost") {
    await db.from("leads").update({ status: "not_interested" }).eq("id", deal.lead_id);
  }
}

/** Send a reply to a lead from the inbox (warm email via Resend) and log it. */
export async function sendReply(args: {
  leadId: string;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; pending?: boolean }> {
  const db = supabase();
  const lead = unwrap<{ id: string; email: string | null }>(
    await db.from("leads").select("id, email").eq("id", args.leadId).single(),
  );
  if (!lead.email) throw new Error("Lead has no email address");
  if (await isSuppressed(lead.email)) throw new Error("This address is on the suppression list");
  const res = await sendWarmEmail({ to: lead.email, subject: args.subject, text: args.body });
  if ("pending" in res) return { sent: false, pending: true };
  await db.from("messages").insert({
    lead_id: lead.id,
    channel: "email",
    direction: "outbound",
    subject: args.subject,
    body: args.body,
    external_id: res.externalId,
    read_at: new Date().toISOString(),
  });
  return { sent: true };
}
