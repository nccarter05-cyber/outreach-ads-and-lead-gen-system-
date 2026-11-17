"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth";
import { generateSocialCopy, type GeneratedSocialPost } from "@/lib/claude";
import {
  claimPost,
  getAccountRow,
  publishBlocker,
  publishClaimed,
  validateContent,
  type PublishOutcome,
} from "@/lib/social";
import { runSocialPublishTick, type SocialTickResult } from "@/lib/social-processor";
import { supabase, unwrap } from "@/lib/supabase";
import type {
  SegmentRow,
  SocialLinkType,
  SocialPlatform,
  SocialPostRow,
} from "@/lib/types";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function refresh() {
  revalidatePath("/social");
  revalidatePath("/social/performance");
}

const EDITABLE: SocialPostRow["status"][] = ["draft", "scheduled", "failed"];

export interface SocialPostInput {
  id?: string;
  platform: SocialPlatform;
  accountId: string | null;
  content: string;
  linkType: SocialLinkType;
  linkUrl: string | null;
  landingHeadline: string;
  landingBody: string;
  landingCta: string;
  segmentId: string | null;
  /** ISO timestamp; required when intent is "schedule". */
  scheduledAt: string | null;
  intent: "draft" | "schedule";
}

/**
 * Create or update a post. Scheduling goes through the same publishBlocker()
 * gate as the tick, so a post that can't go out (LinkedIn without API access,
 * Instagram without an image, no connected account) is saved as a draft with
 * the reason, never as a scheduled post that silently won't publish.
 */
export async function saveSocialPost(
  input: SocialPostInput,
): Promise<{ ok: boolean; id?: string; status?: SocialPostRow["status"]; warning?: string; error?: string }> {
  try {
    await assertUser();
    const invalid = validateContent(input);
    if (invalid) return { ok: false, error: invalid };
    if (input.intent === "schedule" && !input.scheduledAt) {
      return { ok: false, error: "Pick a date and time to schedule it" };
    }

    const account = await getAccountRow(input.accountId);
    if (account && account.platform !== input.platform) {
      return { ok: false, error: "That account belongs to a different platform" };
    }

    let status: SocialPostRow["status"] = "draft";
    let warning: string | undefined;
    if (input.intent === "schedule") {
      const blocker = publishBlocker(
        { platform: input.platform, content: input.content, link_type: input.linkType },
        account,
      );
      if (blocker) warning = blocker;
      else status = "scheduled";
    }

    const row = {
      platform: input.platform,
      account_id: account?.id ?? null,
      content: input.content,
      link_type: input.linkType,
      link_url: input.linkType === "custom" ? input.linkUrl : null,
      landing_headline: input.landingHeadline.trim(),
      landing_body: input.landingBody.trim(),
      landing_cta: input.landingCta.trim() || "Get in touch",
      segment_id: input.segmentId,
      scheduled_at: input.scheduledAt,
      status,
      error: warning ?? null,
      updated_at: new Date().toISOString(),
    };

    const db = supabase();
    let id = input.id;
    if (id) {
      const updated = unwrap<{ id: string }[]>(
        await db.from("social_posts").update(row).eq("id", id).in("status", EDITABLE).select("id"),
      );
      if (updated.length === 0) {
        return { ok: false, error: "This post is publishing or already published and can't be edited" };
      }
    } else {
      id = unwrap<{ id: string }>(
        await db.from("social_posts").insert(row).select("id").single(),
      ).id;
    }
    refresh();
    return { ok: true, id, status, warning };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function unscheduleSocialPost(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertUser();
    unwrap(
      await supabase()
        .from("social_posts")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "scheduled")
        .select("id"),
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Deletes the row only — a published post stays live on the platform. */
export async function deleteSocialPost(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertUser();
    unwrap(
      await supabase()
        .from("social_posts")
        .delete()
        .eq("id", id)
        .neq("status", "publishing")
        .select("id"),
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function publishSocialPostNow(
  id: string,
): Promise<{ ok: boolean; outcome?: PublishOutcome; error?: string }> {
  try {
    await assertUser();
    const claimed = await claimPost(id, ["draft", "scheduled", "failed"]);
    if (!claimed) return { ok: false, error: "Post is already publishing or published" };
    const outcome = await publishClaimed(claimed);
    refresh();
    return { ok: outcome.kind === "published", outcome };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Copy a post to another platform as a new draft (own tracking code => own attribution). */
export async function duplicateSocialPost(
  id: string,
  platform: SocialPlatform,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await assertUser();
    const db = supabase();
    const src = unwrap<SocialPostRow>(await db.from("social_posts").select("*").eq("id", id).single());
    const account = unwrap<{ id: string } | null>(
      await db
        .from("social_accounts")
        .select("id")
        .eq("platform", platform)
        .eq("status", "active")
        .order("connected_at")
        .limit(1)
        .maybeSingle(),
    );
    const created = unwrap<{ id: string }>(
      await db
        .from("social_posts")
        .insert({
          platform,
          account_id: account?.id ?? null,
          content: src.content,
          link_type: src.link_type,
          link_url: src.link_url,
          landing_headline: src.landing_headline,
          landing_body: src.landing_body,
          landing_cta: src.landing_cta,
          segment_id: src.segment_id,
          status: "draft",
        })
        .select("id")
        .single(),
    );
    refresh();
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function generateSocialPostCopy(input: {
  platform: SocialPlatform;
  brief: string;
  segmentId: string | null;
  withLanding: boolean;
}): Promise<{ ok: true; copy: GeneratedSocialPost } | { ok: false; error: string }> {
  try {
    await assertUser();
    if (!input.brief.trim()) return { ok: false, error: "Write a short brief first" };
    const segment = input.segmentId
      ? unwrap<SegmentRow | null>(
          await supabase().from("segments").select("*").eq("id", input.segmentId).maybeSingle(),
        )
      : null;
    const copy = await generateSocialCopy({
      platform: input.platform,
      brief: input.brief,
      withLanding: input.withLanding,
      audience: segment
        ? { name: segment.name, description: segment.description, criteria: segment.criteria ?? [] }
        : undefined,
    });
    return { ok: true, copy };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Revoke our copy of the token. Posts keep their history; scheduled ones fall back to draft at publish time. */
export async function disconnectSocialAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertUser();
    unwrap(
      await supabase()
        .from("social_accounts")
        .update({
          status: "disconnected",
          access_token: null,
          refresh_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id"),
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function runSocialTickNow(): Promise<
  { ok: true; result: SocialTickResult } | { ok: false; error: string }
> {
  try {
    await assertUser();
    const result = await runSocialPublishTick();
    refresh();
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
