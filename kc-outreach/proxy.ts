import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Route protection + session refresh. In Next 16 this file is `proxy.ts`;
// the old `middleware.ts` convention is deprecated (see
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
//
// This is the OPTIMISTIC gate: it keeps unauthenticated traffic out of the
// dashboard and refreshes the auth cookie. The authoritative check lives in
// lib/auth.ts requireUser(), called by the (dashboard) layout, because proxy
// code runs before rendering and should not be the only thing standing between
// a request and the data.

// Paths that must stay reachable without a session.
const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/unsubscribe", // CAN-SPAM one-click unsubscribe, hit by recipients
  "/lp", // Phase 8 social landing pages (public lead capture)
  "/api/cron", // bearer-token authenticated (CRON_SECRET)
  "/api/webhooks", // shared-secret authenticated
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  if (isPublic(pathname)) return response;

  // Without auth configured, fail CLOSED rather than serving the dashboard
  // wide open — except on /login, which has to render to explain the problem.
  if (!process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.SUPABASE_URL) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "unconfigured");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes an expiring session as a side effect of verifying it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Send them back where they were headed after signing in.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
