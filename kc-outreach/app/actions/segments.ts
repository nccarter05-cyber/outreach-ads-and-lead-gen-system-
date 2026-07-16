"use server";

import { revalidatePath } from "next/cache";
import { supabase, unwrap } from "@/lib/supabase";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function createSegment(input: {
  name: string;
  description: string;
  criteria: string[];
}): Promise<ActionResult> {
  try {
    unwrap(
      await supabase()
        .from("segments")
        .insert({
          name: input.name,
          description: input.description,
          criteria: input.criteria,
        })
        .select("id"),
    );
    revalidatePath("/audiences");
    revalidatePath("/leads");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSegment(id: string): Promise<ActionResult> {
  try {
    unwrap(await supabase().from("segments").delete().eq("id", id).select("id"));
    revalidatePath("/audiences");
    revalidatePath("/leads");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
