import { NextResponse } from "next/server";
import { supabase, unwrap } from "@/lib/supabase";
import type { OutreachLogRow } from "@/lib/types";

// Instantly.ai webhook receiver. Instantly doesn't sign payloads, so the
// endpoint is protected by a shared secret in the URL:
//   POST /api/webhooks/instantly?secret=<INSTANTLY_WEBHOOK_SECRET>
// Configure in the Instantly dashboard for: email_sent, email_opened,
// reply_received, email_bounced.

interface InstantlyEvent {
  event_type?: string;
  campaign_id?: string;
  lead_email?: string;
  email?: string;
  timestamp?: string;
}

export async function POST(request: Request) {
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET;
  const provided = new URL(request.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let event: InstantlyEvent;
  try {
    event = (await request.json()) as InstantlyEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const email = (event.lead_email ?? event.email ?? "").toLowerCase();
  const eventType = event.event_type ?? "";
  if (!email || !eventType) {
    return NextResponse.json({ ok: true, ignored: "missing email or event_type" });
  }

  try {
    const db = supabase();
    const lead = unwrap<{ id: string } | null>(
      await db.from("leads").select("id").ilike("email", email).maybeSingle(),
    );
    if (!lead) return NextResponse.json({ ok: true, ignored: "unknown lead" });

    // Most recent sent email touch for this lead
    const log = unwrap<OutreachLogRow | null>(
      await db
        .from("outreach_logs")
        .select("*")
        .eq("lead_id", lead.id)
        .eq("channel", "email")
        .in("status", ["sent", "opened", "pending_integration"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    const now = event.timestamp ?? new Date().toISOString();

    switch (eventType) {
      case "email_opened":
      case "link_clicked": {
        if (log && !log.opened_at) {
          await db
            .from("outreach_logs")
            .update({ opened_at: now, status: log.status === "sent" ? "opened" : log.status })
            .eq("id", log.id);
        }
        break;
      }
      case "reply_received": {
        if (log) {
          await db
            .from("outreach_logs")
            .update({ replied_at: now, status: "replied" })
            .eq("id", log.id);
        }
        await db
          .from("campaign_leads")
          .update({ status: "replied", replied_at: now, stopped_reason: "reply_received" })
          .eq("lead_id", lead.id)
          .in("status", ["pending", "in_progress"]);
        await db.from("leads").update({ status: "replied" }).eq("id", lead.id);
        break;
      }
      case "email_bounced":
      case "lead_unsubscribed": {
        if (log) {
          await db
            .from("outreach_logs")
            .update({ status: "failed", error: eventType })
            .eq("id", log.id);
        }
        await db
          .from("campaign_leads")
          .update({ status: "stopped", stopped_reason: eventType })
          .eq("lead_id", lead.id)
          .in("status", ["pending", "in_progress"]);
        break;
      }
      default:
        return NextResponse.json({ ok: true, ignored: eventType });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
