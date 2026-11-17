import type { NextRequest } from "next/server";
import { exchangeCode, listPages } from "@/lib/meta";
import { backToSocial, clearState, redirectUri, requireRouteUser, stateMatches } from "@/lib/oauth";
import { saveConnectedAccounts, type ConnectedAccount } from "@/lib/social";

// Meta OAuth callback: code -> long-lived user token -> Page tokens (non-expiring).
// Stores one social_accounts row per Page, plus one per linked IG Business account
// (IG is published through its Page's token).
export async function GET(request: NextRequest) {
  const denied = await requireRouteUser(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;

  if (!stateMatches(request, "meta")) {
    return clearState(backToSocial(request, { error: "Meta connect expired or was tampered with — try again" }), "meta");
  }
  const providerError = params.get("error_description") ?? params.get("error");
  const code = params.get("code");
  if (providerError || !code) {
    return clearState(backToSocial(request, { error: `Meta: ${providerError ?? "no code returned"}` }), "meta");
  }

  try {
    const userToken = await exchangeCode(code, redirectUri(request, "meta"));
    const pages = await listPages(userToken);
    const accounts: ConnectedAccount[] = [];
    for (const page of pages) {
      accounts.push({
        platform: "facebook",
        externalId: page.id,
        name: page.name,
        accessToken: page.accessToken,
      });
      if (page.instagram) {
        accounts.push({
          platform: "instagram",
          externalId: page.instagram.id,
          name: page.instagram.username || page.name,
          handle: page.instagram.username || null,
          accessToken: page.accessToken,
          meta: { page_id: page.id, page_name: page.name },
        });
      }
    }
    if (accounts.length === 0) {
      return clearState(
        backToSocial(request, { error: "Meta: no Facebook Pages were granted — re-run connect and select your Page" }),
        "meta",
      );
    }
    const n = await saveConnectedAccounts(accounts);
    return clearState(backToSocial(request, { connected: "meta", n: String(n) }), "meta");
  } catch (e) {
    return clearState(backToSocial(request, { error: e instanceof Error ? e.message : String(e) }), "meta");
  }
}
