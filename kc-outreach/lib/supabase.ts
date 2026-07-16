import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role client, server only. RLS is enabled with zero policies, so this
// client is the sole access path until auth lands. Never expose to the browser.

let client: SupabaseClient<any, any, "outreach"> | null = null;

export function supabase(): SupabaseClient<any, any, "outreach"> {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // All outreach tables live in the dedicated "outreach" schema on the
      // shared kc-backend project (exposed via pgrst.db_schemas).
      db: { schema: "outreach" },
    });
  }
  return client;
}

/** Unwraps a supabase-js response, throwing on error. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
