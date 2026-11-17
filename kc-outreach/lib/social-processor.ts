import "server-only";
import { claimPost, publishClaimed, refreshPostMetrics } from "./social";
import { supabase, unwrap } from "./supabase";
import type { SocialPostRow } from "./types";

// Social scheduler tick. Driven hourly by n8n via /api/cron/social (same
// CRON_SECRET bearer as the outreach cron) and by the "Publish due posts"
// button. Safe to run concurrently or twice: claimPost() is the lock.

const PUBLISH_BATCH = 10;
const METRICS_BATCH = 25;
const METRICS_WINDOW_DAYS = 30;
const METRICS_MIN_AGE_MS = 55 * 60_000; // ~hourly per post
const STUCK_AFTER_MS = 15 * 60_000;

export interface SocialTickResult {
  published: number;
  failed: number;
  backToDraft: number;
  recovered: number;
  metricsRefreshed: number;
  notes: string[];
}

export async function runSocialPublishTick(now = new Date()): Promise<SocialTickResult> {
  const db = supabase();
  const result: SocialTickResult = {
    published: 0,
    failed: 0,
    backToDraft: 0,
    recovered: 0,
    metricsRefreshed: 0,
    notes: [],
  };

  // 1. A run that died mid-publish leaves posts in `publishing`. Don't retry
  //    them blind — the platform may have accepted the post — mark them failed
  //    so a human checks the page before re-publishing.
  const stuck = unwrap<{ id: string }[]>(
    await db
      .from("social_posts")
      .update({
        status: "failed",
        error: "Publishing was interrupted — check the platform before retrying, it may already be live",
        updated_at: now.toISOString(),
      })
      .eq("status", "publishing")
      .lt("updated_at", new Date(now.getTime() - STUCK_AFTER_MS).toISOString())
      .select("id"),
  );
  result.recovered = stuck.length;

  // 2. Publish what's due.
  const due = unwrap<{ id: string }[]>(
    await db
      .from("social_posts")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at")
      .limit(PUBLISH_BATCH),
  );
  for (const { id } of due) {
    const claimed = await claimPost(id, ["scheduled"]);
    if (!claimed) continue; // someone else got it
    const outcome = await publishClaimed(claimed);
    if (outcome.kind === "published") result.published += 1;
    else if (outcome.kind === "draft") {
      result.backToDraft += 1;
      result.notes.push(outcome.reason);
    } else {
      result.failed += 1;
      result.notes.push(outcome.error);
    }
  }

  // 3. Refresh metrics on recent posts, stalest first.
  const recent = unwrap<SocialPostRow[]>(
    await db
      .from("social_posts")
      .select("*")
      .eq("status", "published")
      .gte("published_at", new Date(now.getTime() - METRICS_WINDOW_DAYS * 86_400_000).toISOString())
      .or(`metrics_updated_at.is.null,metrics_updated_at.lt.${new Date(now.getTime() - METRICS_MIN_AGE_MS).toISOString()}`)
      .order("metrics_updated_at", { ascending: true, nullsFirst: true })
      .limit(METRICS_BATCH),
  );
  for (const post of recent) {
    if (await refreshPostMetrics(post)) result.metricsRefreshed += 1;
  }

  result.notes = [...new Set(result.notes)];
  return result;
}
