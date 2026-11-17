import "server-only";
import { notifyOwner } from "./email";
import { ensureOpenDeal } from "./inbox";
import * as linkedin from "./linkedin";
import * as meta from "./meta";
import { supabase, unwrap } from "./supabase";
import {
  socialCharLimits,
  socialPlatformLabels,
  type SocialAccountRow,
  type SocialLinkType,
  type SocialPlatform,
  type SocialPostRow,
} from "./types";

// Phase 8 core: everything that touches a platform or a social_posts row
// outside of plain CRUD. Used by the social tick (lib/social-processor.ts), the
// "Publish now" server action, the OAuth callbacks and the public landing page.

// ── Links + validation ──────────────────────────────────────────────────────

export function appUrl(): string | null {
  return process.env.APP_URL?.replace(/\/$/, "") || null;
}

export function landingUrl(trackingCode: string): string {
  const base = appUrl();
  if (!base) throw new Error("Set APP_URL (public https URL of this app) for landing-page links");
  return `${base}/lp/${trackingCode}`;
}

/** The URL the published post points at, or null. */
export function postLink(row: Pick<SocialPostRow, "link_type" | "link_url" | "tracking_code">): string | null {
  if (row.link_type === "landing") return landingUrl(row.tracking_code);
  if (row.link_type === "custom") return row.link_url || null;
  return null;
}

export function platformConfigured(platform: SocialPlatform): boolean {
  return platform === "linkedin" ? linkedin.isConfigured() : meta.isConfigured();
}

/** Content-level problems that block saving at all. */
export function validateContent(input: {
  platform: SocialPlatform;
  content: string;
  linkType: SocialLinkType;
  linkUrl?: string | null;
}): string | null {
  const limit = socialCharLimits[input.platform];
  if (input.content.length > limit) {
    return `${socialPlatformLabels[input.platform]} allows ${limit.toLocaleString("en-US")} characters; this is ${input.content.length.toLocaleString("en-US")}`;
  }
  if (input.platform === "instagram" && (input.content.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0) > 30) {
    return "Instagram allows at most 30 hashtags";
  }
  if (input.linkType === "custom") {
    try {
      const u = new URL(input.linkUrl ?? "");
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    } catch {
      return "Custom link must be a full http(s) URL";
    }
  }
  return null;
}

/**
 * Why this post can't go out right now, or null if it can. This is the single
 * gate for scheduling, "Publish now" and the tick — it is what keeps LinkedIn
 * (and any unconnected platform) in drafts.
 */
export function publishBlocker(
  post: Pick<SocialPostRow, "platform" | "content" | "link_type">,
  account: Pick<SocialAccountRow, "status" | "platform"> | null,
): string | null {
  if (!post.content.trim()) return "Post has no content";
  if (post.platform === "instagram") {
    return "Instagram has no text-only posts — image posts arrive with Phase 8.1. Save it as a draft for now.";
  }
  if (!platformConfigured(post.platform)) {
    return post.platform === "linkedin"
      ? "LinkedIn isn't set up (needs Community Management API approval + LINKEDIN_CLIENT_ID/SECRET) — saved as draft"
      : "Meta isn't set up (META_APP_ID / META_APP_SECRET) — saved as draft";
  }
  if (!account) return `No ${socialPlatformLabels[post.platform]} account selected — saved as draft`;
  if (account.platform !== post.platform) return "Selected account is for a different platform";
  if (account.status !== "active") {
    return `${socialPlatformLabels[post.platform]} account is ${account.status} — reconnect it`;
  }
  if (post.link_type === "landing" && !appUrl()) {
    return "Landing-page links need APP_URL set";
  }
  return null;
}

// ── Accounts ────────────────────────────────────────────────────────────────

export async function getAccountRow(id: string | null): Promise<SocialAccountRow | null> {
  if (!id) return null;
  return unwrap<SocialAccountRow | null>(
    await supabase().from("social_accounts").select("*").eq("id", id).maybeSingle(),
  );
}

async function markAccount(id: string, status: SocialAccountRow["status"], error: string | null) {
  await supabase()
    .from("social_accounts")
    .update({ status, last_error: error, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * LinkedIn tokens expire (~60 days). Refresh when close and a refresh token
 * exists; otherwise flag the account expired so the UI asks for a reconnect.
 * Returns the usable account row, or null when it can't be used.
 */
export async function ensureFreshToken(account: SocialAccountRow): Promise<SocialAccountRow | null> {
  if (!account.token_expires_at) return account;
  const msLeft = new Date(account.token_expires_at).getTime() - Date.now();
  if (msLeft > 24 * 3_600_000) return account;
  if (account.platform === "linkedin" && account.refresh_token) {
    try {
      const t = await linkedin.refreshAccessToken(account.refresh_token);
      const updated = {
        access_token: t.accessToken,
        token_expires_at: t.expiresAt,
        refresh_token: t.refreshToken ?? account.refresh_token,
        status: "active" as const,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
      await supabase().from("social_accounts").update(updated).eq("id", account.id);
      return { ...account, ...updated };
    } catch (e) {
      if (msLeft > 0) return account;
      await markAccount(account.id, "expired", e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  if (msLeft > 0) return account;
  await markAccount(account.id, "expired", "Access token expired — reconnect the account");
  return null;
}

export interface ConnectedAccount {
  platform: SocialPlatform;
  externalId: string;
  name: string;
  handle?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  meta?: Record<string, unknown>;
}

/** Upsert accounts returned by an OAuth callback (reconnecting reactivates them). */
export async function saveConnectedAccounts(accounts: ConnectedAccount[]): Promise<number> {
  if (accounts.length === 0) return 0;
  const now = new Date().toISOString();
  unwrap(
    await supabase()
      .from("social_accounts")
      .upsert(
        accounts.map((a) => ({
          platform: a.platform,
          external_id: a.externalId,
          name: a.name,
          handle: a.handle ?? null,
          access_token: a.accessToken,
          refresh_token: a.refreshToken ?? null,
          token_expires_at: a.tokenExpiresAt ?? null,
          status: "active",
          last_error: null,
          meta: a.meta ?? {},
          connected_at: now,
          updated_at: now,
        })),
        { onConflict: "platform,external_id" },
      )
      .select("id"),
  );
  return accounts.length;
}

// ── Publishing ──────────────────────────────────────────────────────────────

/**
 * Atomically move a post into `publishing`. Only one caller can win, so a tick
 * and a "Publish now" click can never both post it.
 */
export async function claimPost(
  id: string,
  from: SocialPostRow["status"][],
): Promise<SocialPostRow | null> {
  const rows = unwrap<SocialPostRow[]>(
    await supabase()
      .from("social_posts")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", from)
      .select("*"),
  );
  return rows[0] ?? null;
}

export type PublishOutcome =
  | { kind: "published"; permalink: string | null }
  | { kind: "draft"; reason: string }
  | { kind: "failed"; error: string };

/** Publish a post already claimed into `publishing`, and record the outcome. */
export async function publishClaimed(post: SocialPostRow): Promise<PublishOutcome> {
  const db = supabase();
  const now = () => new Date().toISOString();
  let account = await getAccountRow(post.account_id);
  if (account) account = await ensureFreshToken(account);

  const blocker = publishBlocker(post, account ?? (post.account_id ? { status: "expired", platform: post.platform } : null));
  if (blocker) {
    // Not an error with the post: it simply can't go out yet. Back to drafts.
    await db
      .from("social_posts")
      .update({ status: "draft", error: blocker, updated_at: now() })
      .eq("id", post.id);
    return { kind: "draft", reason: blocker };
  }
  const acct = account!;

  try {
    const link = postLink(post);
    let result: meta.PublishResult;
    if (post.platform === "facebook") {
      result = await meta.publishFacebook(acct.external_id, acct.access_token!, {
        message: post.content,
        link,
      });
    } else if (post.platform === "instagram") {
      result = await meta.publishInstagram(acct.external_id, acct.access_token!, {
        caption: post.content,
      });
    } else {
      result = await linkedin.publishPost(acct.external_id, acct.access_token!, {
        commentary: post.content,
        link,
        title: post.landing_headline || undefined,
        description: post.link_type === "landing" ? post.landing_body.slice(0, 200) : undefined,
      });
    }
    await db
      .from("social_posts")
      .update({
        status: "published",
        published_at: now(),
        external_post_id: result.externalId,
        permalink: result.permalink,
        error: null,
        attempts: post.attempts + 1,
        updated_at: now(),
      })
      .eq("id", post.id);
    return { kind: "published", permalink: result.permalink };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (meta.isTokenError(e) || linkedin.isTokenError(e)) {
      await markAccount(acct.id, "error", error);
    }
    await db
      .from("social_posts")
      .update({ status: "failed", error, attempts: post.attempts + 1, updated_at: now() })
      .eq("id", post.id);
    return { kind: "failed", error };
  }
}

// ── Metrics ─────────────────────────────────────────────────────────────────

/** Pull fresh platform metrics for a published post. Missing values keep their old number. */
export async function refreshPostMetrics(post: SocialPostRow): Promise<boolean> {
  if (!post.external_post_id) return false;
  let account = await getAccountRow(post.account_id);
  if (!account || account.status !== "active" || !account.access_token) return false;
  account = await ensureFreshToken(account);
  if (!account) return false;

  let m: meta.PlatformMetrics;
  try {
    if (post.platform === "facebook") {
      m = await meta.facebookMetrics(post.external_post_id, account.access_token!);
    } else if (post.platform === "instagram") {
      m = await meta.instagramMetrics(post.external_post_id, account.access_token!);
    } else if (post.platform === "linkedin") {
      m = await linkedin.postMetrics(account.external_id, account.access_token!, post.external_post_id);
    } else {
      return false;
    }
  } catch (e) {
    if (meta.isTokenError(e) || linkedin.isTokenError(e)) {
      await markAccount(account.id, "error", e instanceof Error ? e.message : String(e));
    }
    // Stamp it anyway so one bad post doesn't get retried every tick forever.
    await supabase()
      .from("social_posts")
      .update({ metrics_updated_at: new Date().toISOString() })
      .eq("id", post.id);
    return false;
  }

  await supabase()
    .from("social_posts")
    .update({
      impressions: m.impressions ?? post.impressions,
      likes: m.likes ?? post.likes,
      comments: m.comments ?? post.comments,
      shares: m.shares ?? post.shares,
      clicks: m.clicks ?? post.clicks,
      metrics_updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);
  return true;
}

// ── Landing-page lead capture (public) ──────────────────────────────────────

export interface LandingPost {
  id: string;
  platform: SocialPlatform;
  status: SocialPostRow["status"];
  trackingCode: string;
  headline: string;
  body: string;
  cta: string;
}

/** Only the public-safe columns. Never select * on the public route. */
export async function getLandingPost(code: string): Promise<LandingPost | null> {
  if (!/^[a-z0-9]{6,32}$/i.test(code)) return null;
  const row = unwrap<Pick<
    SocialPostRow,
    "id" | "platform" | "status" | "tracking_code" | "landing_headline" | "landing_body" | "landing_cta"
  > | null>(
    await supabase()
      .from("social_posts")
      .select("id, platform, status, tracking_code, landing_headline, landing_body, landing_cta")
      .eq("tracking_code", code)
      .maybeSingle(),
  );
  if (!row) return null;
  return {
    id: row.id,
    platform: row.platform,
    status: row.status,
    trackingCode: row.tracking_code,
    headline: row.landing_headline,
    body: row.landing_body,
    cta: row.landing_cta || "Get in touch",
  };
}

export async function recordLandingEvent(code: string, kind: "view" | "submit"): Promise<void> {
  await supabase().rpc("record_landing_event", { p_code: code, p_kind: kind });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A landing-page form submission. New people become `social` leads attributed
 * to the post (segment from the post's target); existing leads keep their
 * original source. Either way the submission lands in the inbox as an inbound
 * `web` message, opens a deal, stops any cold sequence they're in, and pings
 * the owner — it's a warm inbound inquiry, not a cold lead.
 */
export async function captureSocialLead(input: {
  code: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim().slice(0, 200);
  const email = input.email.trim().toLowerCase().slice(0, 254);
  const company = (input.company ?? "").trim().slice(0, 200);
  const phone = (input.phone ?? "").trim().slice(0, 40);
  const message = (input.message ?? "").trim().slice(0, 4000);
  if (!name) return { ok: false, error: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };

  const db = supabase();
  const post = unwrap<Pick<SocialPostRow, "id" | "platform" | "segment_id" | "landing_headline"> | null>(
    await db
      .from("social_posts")
      .select("id, platform, segment_id, landing_headline")
      .eq("tracking_code", input.code)
      .maybeSingle(),
  );
  if (!post) return { ok: false, error: "This page is no longer available." };

  let lead = unwrap<{ id: string; status: string } | null>(
    await db.from("leads").select("id, status").ilike("email", email).maybeSingle(),
  );
  const isNew = !lead;
  if (!lead) {
    const ins = await db
      .from("leads")
      .insert({
        name,
        company,
        email,
        phone: phone || null,
        source: "social",
        source_post_id: post.id,
        segment_id: post.segment_id,
        status: "replied",
      })
      .select("id, status")
      .single();
    if (ins.error) {
      // Lost a race on the unique email index: someone just created it.
      lead = unwrap<{ id: string; status: string } | null>(
        await db.from("leads").select("id, status").ilike("email", email).maybeSingle(),
      );
      if (!lead) return { ok: false, error: "Something went wrong — please try again." };
    } else {
      lead = ins.data;
    }
  } else if (!["booked", "not_interested"].includes(lead.status)) {
    await db.from("leads").update({ status: "replied" }).eq("id", lead.id);
  }

  const details = [
    `Name: ${name}`,
    `Email: ${email}`,
    company && `Company: ${company}`,
    phone && `Phone: ${phone}`,
  ]
    .filter(Boolean)
    .join("\n");
  await db.from("messages").insert({
    lead_id: lead!.id,
    channel: "web",
    direction: "inbound",
    subject: `Landing page (${socialPlatformLabels[post.platform]}): ${post.landing_headline || "inquiry"}`,
    body: message ? `${message}\n\n${details}` : details,
  });

  // They reached out: no more cold touches.
  await db
    .from("campaign_leads")
    .update({ status: "replied", replied_at: new Date().toISOString() })
    .eq("lead_id", lead!.id)
    .in("status", ["pending", "in_progress"]);

  await ensureOpenDeal(lead!.id);
  await recordLandingEvent(input.code, "submit");
  await notifyOwner(
    `New ${isNew ? "lead" : "inquiry"} from a ${socialPlatformLabels[post.platform]} post: ${name}`,
    `${details}\n\n${message || "(no message)"}\n\nOpen the inbox: ${appUrl() ?? ""}/inbox`,
  ).catch(() => false);
  return { ok: true };
}
