"use server";

import { revalidatePath } from "next/cache";
import { supabase, unwrap } from "@/lib/supabase";
import type { Channel, CopySource, SequenceStepRow } from "@/lib/types";

export interface StepInput {
  /** Existing DB uuid, or a temp client id for new steps */
  id?: string;
  stepOrder: number;
  delayDays: number;
  channel: Channel;
  copySource: CopySource;
  templatePrompt: string;
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface SequenceInput {
  /** Existing DB uuid; omit to create */
  id?: string;
  name: string;
  description: string;
  segmentId?: string;
  steps: StepInput[];
}

interface SaveResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function saveSequence(input: SequenceInput): Promise<SaveResult> {
  const db = supabase();
  try {
    let sequenceId = input.id;
    const seqPayload = {
      name: input.name,
      description: input.description,
      segment_id: input.segmentId ?? null,
      updated_at: new Date().toISOString(),
    };

    if (sequenceId) {
      unwrap(await db.from("sequences").update(seqPayload).eq("id", sequenceId).select("id"));
    } else {
      const rows = unwrap<{ id: string }[]>(
        await db.from("sequences").insert(seqPayload).select("id"),
      );
      sequenceId = rows[0].id;
    }

    const existing = unwrap<Pick<SequenceStepRow, "id">[]>(
      await db.from("sequence_steps").select("id").eq("sequence_id", sequenceId),
    ).map((r) => r.id);
    const keptIds = new Set<string>();

    // Two passes: orders are unique per sequence, so park updated rows on
    // negative orders first to avoid transient collisions while reordering.
    const updates = input.steps.filter((s) => s.id && existing.includes(s.id));
    for (const [i, step] of updates.entries()) {
      unwrap(
        await db
          .from("sequence_steps")
          .update({ step_order: -(i + 1) })
          .eq("id", step.id!)
          .select("id"),
      );
    }
    for (const step of updates) {
      unwrap(
        await db
          .from("sequence_steps")
          .update({
            step_order: step.stepOrder,
            delay_days: step.delayDays,
            channel: step.channel,
            copy_source: step.copySource,
            template_prompt: step.templatePrompt,
            subject_template: step.subjectTemplate,
            body_template: step.bodyTemplate,
          })
          .eq("id", step.id!)
          .select("id"),
      );
      keptIds.add(step.id!);
    }

    const toDelete = existing.filter((id) => !keptIds.has(id));
    if (toDelete.length) {
      unwrap(await db.from("sequence_steps").delete().in("id", toDelete).select("id"));
    }

    const inserts = input.steps.filter((s) => !s.id || !existing.includes(s.id));
    if (inserts.length) {
      unwrap(
        await db
          .from("sequence_steps")
          .insert(
            inserts.map((step) => ({
              sequence_id: sequenceId,
              step_order: step.stepOrder,
              delay_days: step.delayDays,
              channel: step.channel,
              copy_source: step.copySource,
              template_prompt: step.templatePrompt,
              subject_template: step.subjectTemplate,
              body_template: step.bodyTemplate,
            })),
          )
          .select("id"),
      );
    }

    revalidatePath("/sequences");
    revalidatePath("/audiences");
    return { ok: true, id: sequenceId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function duplicateSequence(id: string): Promise<SaveResult> {
  const db = supabase();
  try {
    const seq = unwrap<{ name: string; description: string; segment_id: string | null } | null>(
      await db.from("sequences").select("name, description, segment_id").eq("id", id).maybeSingle(),
    );
    if (!seq) return { ok: false, error: "Sequence not found" };
    const steps = unwrap<SequenceStepRow[]>(
      await db.from("sequence_steps").select("*").eq("sequence_id", id),
    );

    const created = unwrap<{ id: string }[]>(
      await db
        .from("sequences")
        .insert({
          name: `${seq.name} (copy)`,
          description: seq.description,
          segment_id: seq.segment_id,
        })
        .select("id"),
    );
    const newId = created[0].id;
    if (steps.length) {
      unwrap(
        await db
          .from("sequence_steps")
          .insert(
            steps.map((s) => ({
              sequence_id: newId,
              step_order: s.step_order,
              delay_days: s.delay_days,
              channel: s.channel,
              copy_source: s.copy_source,
              template_prompt: s.template_prompt,
              subject_template: s.subject_template,
              body_template: s.body_template,
            })),
          )
          .select("id"),
      );
    }
    revalidatePath("/sequences");
    return { ok: true, id: newId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSequence(id: string): Promise<SaveResult> {
  try {
    unwrap(await supabase().from("sequences").delete().eq("id", id).select("id"));
    revalidatePath("/sequences");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg.includes("violates foreign key")
        ? "This sequence is used by a campaign — delete the campaign first."
        : msg,
    };
  }
}
