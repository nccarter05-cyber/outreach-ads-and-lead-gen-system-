import "server-only";
import { supabase } from "./supabase";

// Never-email-again list (outreach.suppressions). See migration 0005.

export async function addSuppression(
  email: string | null | undefined,
  reason: string,
  leadId?: string,
): Promise<void> {
  if (!email) return;
  await supabase()
    .from("suppressions")
    .upsert(
      { email: email.trim().toLowerCase(), reason, lead_id: leadId ?? null },
      { onConflict: "email", ignoreDuplicates: true },
    );
}

export async function isSuppressed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { count } = await supabase()
    .from("suppressions")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase());
  return (count ?? 0) > 0;
}
