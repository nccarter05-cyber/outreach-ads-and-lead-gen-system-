import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "./auth";
import { appUrl } from "./social";

// Shared plumbing for the social OAuth connect flows (Meta, LinkedIn).
// /api/oauth/* is NOT a public prefix in proxy.ts, so these routes already sit
// behind the login; each handler re-checks the session authoritatively, and a
// per-flow `state` cookie defends the callback against CSRF/login-swapping.

export type OAuthProvider = "meta" | "linkedin";

const cookieName = (p: OAuthProvider) => `kc_oauth_state_${p}`;

/** Must match the redirect URI registered in the Meta / LinkedIn developer app exactly. */
export function redirectUri(request: NextRequest, provider: OAuthProvider): string {
  return `${appUrl() ?? request.nextUrl.origin}/api/oauth/${provider}/callback`;
}

export function backToSocial(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/social", request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** Session check for route handlers (the dashboard layout's requireUser doesn't cover /api). */
export async function requireRouteUser(request: NextRequest): Promise<NextResponse | null> {
  if (await getSessionUser()) return null;
  return NextResponse.redirect(new URL("/login?next=/social", request.nextUrl.origin));
}

export function startRedirect(provider: OAuthProvider, authorizeUrl: (state: string) => string): NextResponse {
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(cookieName(provider), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on the provider's top-level redirect back to us
    path: `/api/oauth/${provider}`,
    maxAge: 600,
  });
  return res;
}

export function stateMatches(request: NextRequest, provider: OAuthProvider): boolean {
  const expected = request.cookies.get(cookieName(provider))?.value;
  const given = request.nextUrl.searchParams.get("state");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearState(res: NextResponse, provider: OAuthProvider): NextResponse {
  res.cookies.set(cookieName(provider), "", { path: `/api/oauth/${provider}`, maxAge: 0 });
  return res;
}
