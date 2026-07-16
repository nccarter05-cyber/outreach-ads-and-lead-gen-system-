"use server";

import { revalidatePath } from "next/cache";
import { runOutreachTick, type TickResult } from "@/lib/processor";

export async function runSchedulerNow(): Promise<
  { ok: true; result: TickResult } | { ok: false; error: string }
> {
  try {
    const result = await runOutreachTick();
    revalidatePath("/campaigns");
    revalidatePath("/");
    revalidatePath("/leads");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
