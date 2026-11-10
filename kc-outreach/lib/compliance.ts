import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// CAN-SPAM helpers for cold email sent via SMTP (Instantly adds its own footer).
// Unsubscribe links carry an HMAC-signed lead id so they can't be forged.

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("Set UNSUBSCRIBE_SECRET (or CRON_SECRET) to sign unsubscribe links");
  return s;
}

function sign(leadId: string): string {
  return createHmac("sha256", secret()).update(leadId).digest("base64url");
}

export function unsubscribeToken(leadId: string): string {
  return `${leadId}.${sign(leadId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [leadId, sig] = token.split(".");
  if (!leadId || !sig) return null;
  const expected = Buffer.from(sign(leadId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return leadId;
}

export function unsubscribeUrl(leadId: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("Set APP_URL (public https URL of this app) for unsubscribe links");
  return `${base}/unsubscribe?t=${encodeURIComponent(unsubscribeToken(leadId))}`;
}

/** Plain-text footer: physical address + unsubscribe link. */
export function coldFooter(leadId: string): string {
  const address = process.env.COMPANY_ADDRESS;
  if (!address) throw new Error("Set COMPANY_ADDRESS (physical mailing address) — required by CAN-SPAM");
  return `\n\n--\nKing Circle AI · ${address}\nNot interested? Unsubscribe: ${unsubscribeUrl(leadId)}`;
}
