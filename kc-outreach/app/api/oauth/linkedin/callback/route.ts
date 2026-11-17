import type { NextRequest } from "next/server";
import { exchangeCode, listOrganizations } from "@/lib/linkedin";
import { backToSocial, clearState, redirectUri, requireRouteUser, stateMatches } from "@/lib/oauth";
import { saveConnectedAccounts } from "@/lib/social";

// LinkedIn OAuth callback: stores one social_accounts row per administered
// Company Page. Member tokens last ~60 days; lib/social.ts refreshes them when
// LinkedIn issued a refresh token, otherwise flags the account for reconnect.
export async function GET(request: NextRequest) {
  const denied = await requireRouteUser(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;

  if (!stateMatches(request, "linkedin")) {
    return clearState(
      backToSocial(request, { error: "LinkedIn connect expired or was tampered with — try again" }),
      "linkedin",
    );
  }
  const providerError = params.get("error_description") ?? params.get("error");
  const code = params.get("code");
  if (providerError || !code) {
    return clearState(
      backToSocial(request, { error: `LinkedIn: ${providerError ?? "no code returned"}` }),
      "linkedin",
    );
  }

  try {
    const tokens = await exchangeCode(code, redirectUri(request, "linkedin"));
    const orgs = await listOrganizations(tokens.accessToken);
    if (orgs.length === 0) {
      return clearState(
        backToSocial(request, { error: "LinkedIn: this member doesn't administer any Company Page" }),
        "linkedin",
      );
    }
    const n = await saveConnectedAccounts(
      orgs.map((o) => ({
        platform: "linkedin" as const,
        externalId: o.id,
        name: o.name,
        handle: o.vanityName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      })),
    );
    return clearState(backToSocial(request, { connected: "linkedin", n: String(n) }), "linkedin");
  } catch (e) {
    return clearState(
      backToSocial(request, { error: e instanceof Error ? e.message : String(e) }),
      "linkedin",
    );
  }
}
