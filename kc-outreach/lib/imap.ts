import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { ingestInbound } from "./inbox";
import { supabase } from "./supabase";

// IMAP reply poller for SMTP-sent cold email. Reads the same mailbox as
// SMTP_USER/SMTP_PASS (Gmail app password works for IMAP too). Read-only:
// messages are fetched without setting \Seen; dedupe is by Message-ID.

export function isImapConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function pollInbox(
  lookbackDays = 3,
): Promise<{ scanned: number; stored: number }> {
  if (!isImapConfigured()) return { scanned: 0, stored: 0 };
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    logger: false,
  });
  let scanned = 0;
  let stored = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - lookbackDays * 86_400_000);
      const uids = (await client.search({ since })) || [];
      const db = supabase();
      const self = process.env.SMTP_USER!.toLowerCase();
      for (const uid of uids) {
        // Cheap envelope pass first; only download mail from known leads we haven't stored.
        const head = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
        if (!head || !head.envelope) continue;
        scanned += 1;
        const from = head.envelope.from?.[0]?.address?.toLowerCase();
        if (!from || from === self) continue;
        const mid = head.envelope.messageId;
        if (mid) {
          const { count } = await db
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("external_id", `imap:${mid}`);
          if ((count ?? 0) > 0) continue;
        }
        const { count: isLead } = await db
          .from("leads")
          .select("id", { count: "exact", head: true })
          .ilike("email", from);
        if (!isLead) continue;
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const res = await ingestInbound({
          email: from,
          subject: parsed.subject ?? "",
          body: parsed.text ?? "",
          externalId: mid ? `imap:${mid}` : undefined,
          occurredAt: parsed.date?.toISOString(),
        });
        if (res.stored) stored += 1;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return { scanned, stored };
}
