import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Supabase Auth for the internal team. This is a SEPARATE client from the
// service-role one in lib/supabase.ts: it uses the publishable key, carries the
// signed-in user's session in cookies, and is only ever used to answer "who is
// this request?". All data access still goes through the service-role client,
// which stays server-only (RLS is on with zero policies, so nothing else can
// read the outreach schema).
//
// IMPORTANT: auth.users is shared with the KC Dashboard — same Supabase project
// (ref oseiocamxbymbroboeav). A valid login therefore does NOT imply authority
// over outreach data, so AUTH_ALLOWED_EMAILS gates which accounts get in.

export type SessionUser = { id: string; email: string };

function publishableKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "Auth is not configured — set SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }
  return key;
}

/** Cookie-backed auth client. Must be called within a request scope. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, publishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies are readonly.
          // proxy.ts refreshes the session, so this is safe to swallow.
        }
      },
    },
  });
}

/**
 * True when this email is permitted to use the outreach app.
 * Unset allowlist => any authenticated account is accepted. That is the
 * convenient default for a single-operator setup, but because the user pool is
 * shared with the KC Dashboard it should be set before a public deploy.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.AUTH_ALLOWED_EMAILS?.trim();
  if (!raw) return true;
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email.toLowerCase());
}

/** The signed-in, allowlisted user, or null. Never throws on a missing session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!process.env.SUPABASE_PUBLISHABLE_KEY) return null;
  const supabase = await authClient();
  // getUser() revalidates the JWT with Supabase — do not trust getSession()
  // for authorization, its cookie payload is not verified.
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user?.email || !isAllowedEmail(user.email)) return null;
  return { id: user.id, email: user.email };
}

/**
 * Server-side gate for every protected page. proxy.ts already redirects
 * unauthenticated traffic, but that is an optimistic check at the network
 * edge; this is the real one, run next to the data.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
