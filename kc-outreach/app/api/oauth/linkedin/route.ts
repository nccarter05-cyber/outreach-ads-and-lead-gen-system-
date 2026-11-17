import type { NextRequest } from "next/server";
import { authorizeUrl, isConfigured } from "@/lib/linkedin";
import { backToSocial, redirectUri, requireRouteUser, startRedirect } from "@/lib/oauth";

// Starts the LinkedIn Company Page connect flow. Only useful once the LinkedIn
// app has Community Management API access — see lib/linkedin.ts.
export async function GET(request: NextRequest) {
  const denied = await requireRouteUser(request);
  if (denied) return denied;
  if (!isConfigured()) {
    return backToSocial(request, {
      error: "LinkedIn isn't set up: needs Community Management API approval, then LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET",
    });
  }
  const uri = redirectUri(request, "linkedin");
  return startRedirect("linkedin", (state) => authorizeUrl(uri, state));
}
