"use server";

import { captureSocialLead } from "@/lib/social";

// PUBLIC server action — backs the /lp/[code] lead-capture form, no session.
// It does exactly one thing (captureSocialLead, which validates its input and
// only inserts); never add anything here that reads or mutates other data.

export interface LandingFormState {
  status: "idle" | "ok" | "error";
  error?: string;
}

export async function submitLandingForm(
  _prev: LandingFormState,
  form: FormData,
): Promise<LandingFormState> {
  // Honeypot: real people never see or fill this field.
  if (String(form.get("website") ?? "").trim()) return { status: "ok" };

  const res = await captureSocialLead({
    code: String(form.get("code") ?? ""),
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    company: String(form.get("company") ?? ""),
    phone: String(form.get("phone") ?? ""),
    message: String(form.get("message") ?? ""),
  }).catch(() => ({ ok: false as const, error: "Something went wrong — please try again." }));
  return res.ok ? { status: "ok" } : { status: "error", error: res.error };
}
