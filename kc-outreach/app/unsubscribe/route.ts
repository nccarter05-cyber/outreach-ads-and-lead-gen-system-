import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/compliance";
import { supabase } from "@/lib/supabase";

// Public unsubscribe endpoint. GET = human click (confirmation page);
// POST = RFC 8058 one-click (List-Unsubscribe-Post). Both stop all sequences
// for the lead and mark it not_interested, which the processor already honors.

async function unsubscribe(token: string | null): Promise<boolean> {
  const leadId = token ? verifyUnsubscribeToken(token) : null;
  if (!leadId) return false;
  const db = supabase();
  await db.from("leads").update({ status: "not_interested" }).eq("id", leadId);
  await db
    .from("campaign_leads")
    .update({ status: "stopped", stopped_reason: "unsubscribed" })
    .eq("lead_id", leadId)
    .in("status", ["pending", "in_progress"]);
  return true;
}

export async function GET(request: Request) {
  const ok = await unsubscribe(new URL(request.url).searchParams.get("t"));
  const msg = ok
    ? "You've been unsubscribed and won't receive further emails from us."
    : "This unsubscribe link is invalid or has expired.";
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><p>${msg}</p></body>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const ok = await unsubscribe(new URL(request.url).searchParams.get("t"));
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
