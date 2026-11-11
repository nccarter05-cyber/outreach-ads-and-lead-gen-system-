import { NextResponse } from "next/server";
import { pollInbox } from "@/lib/imap";

export const maxDuration = 120;

// Polls the sending mailbox for replies. Call every 5-10 min from n8n:
//   GET /api/cron/inbox  with  Authorization: Bearer $CRON_SECRET
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, result: await pollInbox() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
