import "server-only";

// Meta Graph API: Facebook Page + Instagram Business publishing and insights.
// Same shape as lib/instantly.ts: isConfigured() gates everything, and callers
// degrade (posts stay drafts) rather than error when the app isn't set up.
//
// Token model: the OAuth dance yields a user token, which is swapped for a
// long-lived (~60 day) one; Page tokens fetched with a long-lived user token do
// not expire, so those are what social_accounts stores. An Instagram Business
// account is published through its linked Page's token.

const VERSION = process.env.META_GRAPH_VERSION || "v24.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
];

export function isConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

/** 190 = invalid/expired token, 102 = session error: the account needs reconnecting. */
export function isTokenError(e: unknown): boolean {
  return e instanceof MetaApiError && (e.code === 190 || e.code === 102);
}

async function graph<T>(
  path: string,
  opts: { method?: "GET" | "POST"; params?: Record<string, string>; token?: string } = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const params = { ...(opts.params ?? {}) };
  if (opts.token) params.access_token = opts.token;
  const url = new URL(`${GRAPH}${path}`);
  let body: URLSearchParams | undefined;
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    body = new URLSearchParams(params);
  }
  const res = await fetch(url, { method, body, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number };
  } & T;
  if (!res.ok || json.error) {
    throw new MetaApiError(
      `Meta ${method} ${path} failed: ${json.error?.message ?? `HTTP ${res.status}`}`,
      json.error?.code,
    );
  }
  return json;
}

// ── OAuth ───────────────────────────────────────────────────────────────────

export function authorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

/** code -> short-lived user token -> long-lived user token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const short = await graph<{ access_token: string }>("/oauth/access_token", {
    params: {
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: redirectUri,
      code,
    },
  });
  const long = await graph<{ access_token: string }>("/oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    },
  });
  return long.access_token;
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  instagram: { id: string; username: string } | null;
}

/** Pages the user manages, each with its (non-expiring) Page token and linked IG account. */
export async function listPages(userToken: string): Promise<MetaPage[]> {
  const res = await graph<{
    data: {
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }[];
  }>("/me/accounts", {
    token: userToken,
    params: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" },
  });
  return res.data.map((p) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
    instagram: p.instagram_business_account
      ? {
          id: p.instagram_business_account.id,
          username: p.instagram_business_account.username ?? "",
        }
      : null,
  }));
}

// ── Publishing ──────────────────────────────────────────────────────────────

export interface PublishResult {
  externalId: string;
  permalink: string | null;
}

/** Text (+ optional link preview) post to a Facebook Page feed. */
export async function publishFacebook(
  pageId: string,
  token: string,
  post: { message: string; link?: string | null },
): Promise<PublishResult> {
  const params: Record<string, string> = { message: post.message };
  if (post.link) params.link = post.link;
  const created = await graph<{ id: string }>(`/${pageId}/feed`, {
    method: "POST",
    token,
    params,
  });
  const permalink = await graph<{ permalink_url?: string }>(`/${created.id}`, {
    token,
    params: { fields: "permalink_url" },
  })
    .then((r) => r.permalink_url ?? null)
    .catch(() => null);
  return { externalId: created.id, permalink };
}

/**
 * Instagram two-step publish: create a media container, wait for it, publish.
 * Instagram has no text-only posts, so this needs an image URL; image posts
 * arrive in Phase 8.1 (social-media bucket). Until then it throws.
 */
export async function publishInstagram(
  igUserId: string,
  token: string,
  post: { caption: string; imageUrl?: string | null },
): Promise<PublishResult> {
  if (!post.imageUrl) {
    throw new Error(
      "Instagram has no text-only posts — it needs an image, which arrives with Phase 8.1",
    );
  }
  const container = await graph<{ id: string }>(`/${igUserId}/media`, {
    method: "POST",
    token,
    params: { image_url: post.imageUrl, caption: post.caption },
  });
  // Images are usually ready at once; give processing a few seconds if not.
  for (let i = 0; i < 5; i++) {
    const status = await graph<{ status_code?: string }>(`/${container.id}`, {
      token,
      params: { fields: "status_code" },
    });
    if (status.status_code === "FINISHED" || !status.status_code) break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram media container ${status.status_code.toLowerCase()}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const published = await graph<{ id: string }>(`/${igUserId}/media_publish`, {
    method: "POST",
    token,
    params: { creation_id: container.id },
  });
  const permalink = await graph<{ permalink?: string }>(`/${published.id}`, {
    token,
    params: { fields: "permalink" },
  })
    .then((r) => r.permalink ?? null)
    .catch(() => null);
  return { externalId: published.id, permalink };
}

// ── Insights ────────────────────────────────────────────────────────────────

export interface PlatformMetrics {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
}

/**
 * First metric name that the API accepts. Meta renames/deprecates insight
 * metrics often (e.g. impressions -> views), so each is tried in order and a
 * rejected name is skipped instead of failing the whole refresh.
 */
async function insight(objectId: string, token: string, names: string[]): Promise<number | undefined> {
  for (const metric of names) {
    try {
      const res = await graph<{ data: { values?: { value: unknown }[]; total_value?: { value: unknown } }[] }>(
        `/${objectId}/insights`,
        { token, params: { metric } },
      );
      const d = res.data[0];
      const v = d?.values?.[0]?.value ?? d?.total_value?.value;
      if (typeof v === "number") return v;
    } catch (e) {
      if (isTokenError(e)) throw e;
    }
  }
  return undefined;
}

export async function facebookMetrics(postId: string, token: string): Promise<PlatformMetrics> {
  const base = await graph<{
    shares?: { count: number };
    comments?: { summary?: { total_count: number } };
    reactions?: { summary?: { total_count: number } };
  }>(`/${postId}`, {
    token,
    params: { fields: "shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)" },
  });
  const [impressions, clicks] = await Promise.all([
    insight(postId, token, ["post_media_view", "post_impressions"]),
    insight(postId, token, ["post_clicks"]),
  ]);
  return {
    impressions,
    clicks,
    likes: base.reactions?.summary?.total_count,
    comments: base.comments?.summary?.total_count,
    shares: base.shares?.count ?? 0,
  };
}

export async function instagramMetrics(mediaId: string, token: string): Promise<PlatformMetrics> {
  const base = await graph<{ like_count?: number; comments_count?: number }>(`/${mediaId}`, {
    token,
    params: { fields: "like_count,comments_count" },
  });
  const [impressions, shares] = await Promise.all([
    insight(mediaId, token, ["views", "impressions", "reach"]),
    insight(mediaId, token, ["shares"]),
  ]);
  return { impressions, shares, likes: base.like_count, comments: base.comments_count };
}
