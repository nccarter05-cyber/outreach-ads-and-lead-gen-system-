import type { NextRequest } from "next/server";
import { authorizeUrl, isConfigured } from "@/lib/meta";
import { backToSocial, redirectUri, requireRouteUser, startRedirect } from "@/lib/oauth";

// Starts the Meta connect flow (Facebook Pages + their linked IG Business accounts).
export async function GET(request: NextRequest) {
  const denied = await requireRouteUser(request);
  if (denied) return denied;
  if (!isConfigured()) {
    return backToSocial(request, { error: "Meta isn't set up: add META_APP_ID and META_APP_SECRET" });
  }
  const uri = redirectUri(request, "meta");
  return startRedirect("meta", (state) => authorizeUrl(uri, state));
}
