import "server-only";

// Resend sender for WARM email only: replies, opted-in leads, owner alerts.
// Do not use for cold outreach (Resend's terms prohibit unsolicited bulk mail).

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendResend(args: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<{ externalId: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      reply_to: args.replyTo ?? process.env.RESEND_REPLY_TO ?? undefined,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { id: string };
  return { externalId: `resend:${json.id}` };
}
