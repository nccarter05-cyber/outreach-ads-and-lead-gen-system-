import "server-only";
import type { PlatformMetrics, PublishResult } from "./meta";

// LinkedIn Company Page posting via the versioned REST Posts API (/rest/posts,
// the replacement for the deprecated UGC Posts API) + share statistics.
//
// GATED: organization posting needs LinkedIn's Community Management API, which
// is partner-approval-gated. This module goes through the identical code path
// as Meta, but nothing publishes until (a) LINKEDIN_CLIENT_ID/SECRET are set
// and (b) a Company Page is connected via OAuth with an `active` account row.
// Until then LinkedIn posts can only be saved as drafts (see lib/social.ts).

const API = "https://api.linkedin.com/rest";
const VERSION = process.env.LINKEDIN_API_VERSION || "202510";

export const LINKEDIN_SCOPES = [
  "r_organization_social",
  "w_organization_social",
  "rw_organization_admin",
];

export function isConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export class LinkedInApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function isTokenError(e: unknown): boolean {
  return e instanceof LinkedInApiError && e.status === 401;
}

async function rest(
  path: string,
  token: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new LinkedInApiError(
      `LinkedIn ${init.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`,
      res.status,
    );
  }
  return res;
}

// ── OAuth ───────────────────────────────────────────────────────────────────

export function authorizeUrl(redirectUri: string, state: string): string {
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return url.toString();
}

export interface LinkedInTokens {
  accessToken: string;
  expiresAt: string;
  refreshToken: string | null;
}

async function tokenRequest(params: Record<string, string>): Promise<LinkedInTokens> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new LinkedInApiError(`LinkedIn token request failed (${res.status}): ${await res.text()}`, res.status);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    // Refresh tokens are only issued to approved partner apps.
    refreshToken: json.refresh_token ?? null,
  };
}

export function exchangeCode(code: string, redirectUri: string): Promise<LinkedInTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshAccessToken(refreshToken: string): Promise<LinkedInTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export interface LinkedInOrg {
  id: string;
  name: string;
  vanityName: string | null;
}

/** Company Pages the member administers. */
export async function listOrganizations(token: string): Promise<LinkedInOrg[]> {
  const acls = (await (
    await rest("/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", token)
  ).json()) as { elements: { organization: string }[] };
  const ids = acls.elements
    .map((e) => e.organization.split(":").pop()!)
    .filter(Boolean);
  return Promise.all(
    ids.map(async (id) => {
      try {
        const org = (await (await rest(`/organizations/${id}`, token)).json()) as {
          localizedName?: string;
          vanityName?: string;
        };
        return { id, name: org.localizedName ?? `Organization ${id}`, vanityName: org.vanityName ?? null };
      } catch {
        return { id, name: `Organization ${id}`, vanityName: null };
      }
    }),
  );
}

// ── Publishing ──────────────────────────────────────────────────────────────

/**
 * Posts API commentary uses LinkedIn's "little text" format, where
 * | { } @ [ ] ( ) < > # \ * _ ~ are reserved. Escape them so they print as
 * typed, but turn #word into a real hashtag template.
 */
export function toLittleText(text: string): string {
  const escape = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, "\\$&");
  return text
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part, i) => (i % 2 === 1 ? `{hashtag|\\#|${part.slice(1)}}` : escape(part)))
    .join("");
}

export async function publishPost(
  orgId: string,
  token: string,
  post: { commentary: string; link?: string | null; title?: string; description?: string },
): Promise<PublishResult> {
  const body: Record<string, unknown> = {
    author: `urn:li:organization:${orgId}`,
    commentary: toLittleText(post.commentary),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (post.link) {
    body.content = {
      article: {
        source: post.link,
        title: post.title || post.link,
        ...(post.description ? { description: post.description } : {}),
      },
    };
  }
  const res = await rest("/posts", token, { method: "POST", body });
  const urn = res.headers.get("x-restli-id");
  if (!urn) throw new Error("LinkedIn accepted the post but returned no id");
  return { externalId: urn, permalink: `https://www.linkedin.com/feed/update/${urn}/` };
}

export async function postMetrics(orgId: string, token: string, postUrn: string): Promise<PlatformMetrics> {
  const org = encodeURIComponent(`urn:li:organization:${orgId}`);
  const kind = postUrn.startsWith("urn:li:ugcPost:") ? "ugcPosts" : "shares";
  const res = (await (
    await rest(
      `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&${kind}=List(${encodeURIComponent(postUrn)})`,
      token,
    )
  ).json()) as {
    elements: {
      totalShareStatistics?: {
        impressionCount?: number;
        clickCount?: number;
        likeCount?: number;
        commentCount?: number;
        shareCount?: number;
      };
    }[];
  };
  const s = res.elements[0]?.totalShareStatistics;
  if (!s) return {};
  return {
    impressions: s.impressionCount,
    clicks: s.clickCount,
    likes: s.likeCount,
    comments: s.commentCount,
    shares: s.shareCount,
  };
}
