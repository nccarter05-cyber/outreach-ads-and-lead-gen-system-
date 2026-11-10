import "server-only";
import { dispatchEmail, isConfigured as isInstantlyConfigured } from "./instantly";
import { coldFooter, unsubscribeUrl } from "./compliance";
import { isResendConfigured, sendResend } from "./resend";
import { isSmtpConfigured, sendSmtp, smtpBudgetRemaining } from "./smtp";
import type { Campaign, Lead, SequenceStep } from "./types";

// Email routing. The lead's origin/status decides the provider, not the step:
//   COLD (scraped leads in sequences)  -> COLD_EMAIL_PROVIDER: "smtp" | "instantly"
//   WARM (replies, opted-in, alerts)   -> Resend
// Switching cold sending to Instantly later = set INSTANTLY_API_KEY and
// COLD_EMAIL_PROVIDER=instantly. When the chosen provider isn't configured,
// sends degrade to pending_integration (copy generated, nothing sent).

export type ColdProvider = "smtp" | "instantly";

export function coldProvider(): ColdProvider {
  return process.env.COLD_EMAIL_PROVIDER === "smtp" ? "smtp" : "instantly";
}

export async function isColdConfigured(): Promise<boolean> {
  return coldProvider() === "smtp" ? isSmtpConfigured() : isInstantlyConfigured();
}

/** Mailbox-level sends still allowed today (Infinity for Instantly). */
export async function coldBudgetRemaining(now = new Date()): Promise<number> {
  return coldProvider() === "smtp" ? smtpBudgetRemaining(now) : Number.POSITIVE_INFINITY;
}

export async function dispatchColdEmail(args: {
  campaign: Campaign;
  lead: Lead;
  step: SequenceStep;
  copy: { subject: string; body: string };
}): Promise<{ externalId: string } | { pending: true }> {
  if (!(await isColdConfigured())) return { pending: true };
  if (coldProvider() === "smtp") {
    if (!args.lead.email) throw new Error(`Lead ${args.lead.id} has no email`);
    return sendSmtp({
      to: args.lead.email,
      subject: args.copy.subject,
      body: args.copy.body + coldFooter(args.lead.id),
      unsubscribeUrl: unsubscribeUrl(args.lead.id),
    });
  }
  return dispatchEmail(args);
}

/** Warm email to a lead who contacted us / opted in. Replies route to RESEND_REPLY_TO. */
export async function sendWarmEmail(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ externalId: string } | { pending: true }> {
  if (!isResendConfigured()) return { pending: true };
  return sendResend(args);
}

/** Alert to the owner (hot lead, errors). No-op when Resend or NOTIFY_EMAIL is unset. */
export async function notifyOwner(subject: string, text: string): Promise<boolean> {
  const to = process.env.NOTIFY_EMAIL;
  if (!to || !isResendConfigured()) return false;
  await sendResend({ to, subject, text });
  return true;
}
