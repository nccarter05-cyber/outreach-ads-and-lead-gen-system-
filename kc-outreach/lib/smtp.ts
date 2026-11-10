import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { supabase } from "./supabase";

// Direct SMTP sender (Gmail / Google Workspace / Zoho) for cold outreach.
// Send-only: replies land in the sending mailbox, not in the app (IMAP poller
// is a later Phase 9 task). Plain text only — best for cold deliverability.

let transporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export function smtpDailyCap(): number {
  const n = Number(process.env.SMTP_DAILY_CAP ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** Sends remaining today across all campaigns (mailbox-level cap). */
export async function smtpBudgetRemaining(now = new Date()): Promise<number> {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase()
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .like("external_id", "smtp:%")
    .gte("created_at", dayStart.toISOString());
  return Math.max(0, smtpDailyCap() - (count ?? 0));
}

export async function sendSmtp(args: {
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl?: string;
}): Promise<{ externalId: string }> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const info = await getTransporter().sendMail({
    from,
    to: args.to,
    subject: args.subject,
    text: args.body,
    headers: args.unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${args.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  });
  return { externalId: `smtp:${info.messageId}` };
}
