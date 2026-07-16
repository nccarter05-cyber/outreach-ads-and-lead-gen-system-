import "server-only";
import { generateEmailCopy } from "./claude";
import { supabase, unwrap } from "./supabase";
import type { AiCopyCacheRow, Enrichment, Lead, SequenceStep } from "./types";

export interface ResolvedCopy {
  subject: string;
  body: string;
}

/** {{name}} / {{firstName}} / {{company}} / {{title}} / {{location}} */
export function interpolate(template: string, lead: Lead): string {
  const firstName = lead.name.split(" ")[0];
  return template
    .replaceAll("{{name}}", lead.name)
    .replaceAll("{{firstName}}", firstName)
    .replaceAll("{{company}}", lead.company)
    .replaceAll("{{title}}", lead.title)
    .replaceAll("{{location}}", lead.location);
}

/**
 * Resolves the copy for one touch according to the step's copy_source:
 * - claude: cache lookup by (lead_id, step_id), else generate via Claude and cache
 * - static: server-side variable interpolation of the templates
 * - instantly: raw templates passed through — Instantly personalizes on send
 */
export async function resolveCopy(args: {
  lead: Lead;
  step: SequenceStep;
  enrichment?: Enrichment;
}): Promise<ResolvedCopy> {
  const { lead, step } = args;

  if (step.copySource === "static") {
    return {
      subject: interpolate(step.subjectTemplate, lead),
      body: interpolate(step.bodyTemplate, lead),
    };
  }

  if (step.copySource === "instantly") {
    return { subject: step.subjectTemplate, body: step.bodyTemplate };
  }

  // claude
  const cached = unwrap<Pick<AiCopyCacheRow, "subject" | "body"> | null>(
    await supabase()
      .from("ai_copy_cache")
      .select("subject, body")
      .eq("lead_id", lead.id)
      .eq("step_id", step.id)
      .maybeSingle(),
  );
  if (cached?.body) {
    return { subject: cached.subject ?? "", body: cached.body };
  }

  const generated = await generateEmailCopy({
    lead,
    enrichment: args.enrichment ?? lead.enrichment,
    prompt: step.templatePrompt,
    channel: step.channel,
  });
  // Delete-then-insert instead of upsert: the uniqueness on (lead_id, step_id)
  // is a partial index, which PostgREST's ON CONFLICT can't target.
  await supabase().from("ai_copy_cache").delete().eq("lead_id", lead.id).eq("step_id", step.id);
  unwrap(
    await supabase()
      .from("ai_copy_cache")
      .insert({
        lead_id: lead.id,
        step_id: step.id,
        channel: step.channel,
        subject: generated.subject,
        body: generated.body,
      })
      .select("id"),
  );
  return generated;
}
