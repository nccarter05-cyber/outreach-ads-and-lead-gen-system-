"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authClient, isAllowedEmail } from "@/lib/auth";

export type SignInResult = { ok: false; error: string } | { ok: true };

/**
 * Email/password sign-in. Runs entirely server-side so no Supabase key is
 * shipped to the browser; @supabase/ssr writes the session cookies for us.
 */
export async function signIn(formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "") || "/";

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }
  if (!process.env.SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      error: "Auth is not configured — SUPABASE_PUBLISHABLE_KEY is missing.",
    };
  }
  // Checked before authenticating so a non-team account never gets a session
  // cookie, even a valid KC Dashboard one.
  if (!isAllowedEmail(email)) {
    return { ok: false, error: "That account is not permitted to use this app." };
  }

  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Don't leak whether the address exists.
    return { ok: false, error: "Invalid email or password." };
  }

  revalidatePath("/", "layout");
  // Only ever redirect to an in-app path, never an attacker-supplied origin.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut(): Promise<void> {
  const supabase = await authClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
