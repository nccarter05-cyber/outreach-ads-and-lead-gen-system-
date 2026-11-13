import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  unconfigured:
    "Auth is not configured on this deployment — set SUPABASE_PUBLISHABLE_KEY.",
};

// Public route (see PUBLIC_PREFIXES in proxy.ts). Rendered outside the
// (dashboard) group so it gets no sidebar.
export default async function LoginPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Already signed in — don't show the form again.
  if (await getSessionUser()) redirect("/");

  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-throne px-6 py-16">
      <LoginForm next={target} initialError={error ? ERRORS[error] : undefined} />
    </main>
  );
}
