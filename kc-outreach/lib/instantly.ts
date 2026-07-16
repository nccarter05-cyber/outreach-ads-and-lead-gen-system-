import "server-only";
import { supabase, unwrap } from "./supabase";
import type {
  Campaign,
  CampaignRow,
  IntegrationRow,
  Lead,
  SequenceStep,
} from "./types";

// Instantly.ai v2 API integration (email dispatch arm of the outreach engine).
// Key-ready: when no API key exists, isConfigured() is false and the processor
// logs sends as pending_integration instead of dispatching.
//
// Mapping: KC owns step timing (the cron processor decides when each touch is
// due), so each KC campaign gets ONE "personalized" Instantly campaign whose
// single step is `{{kc_subject}}` / `{{kc_body}}` — final per-lead copy is
// pushed as custom variables at due time. Steps with copy_source='instantly'
// instead get one Instantly campaign per step carrying the raw template, so
// Instantly's own variables/AI personalize on their side.

const BASE = "https://api.instantly.ai/api/v2";

let cachedKey: string | null | undefined;

export async function getInstantlyKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  if (process.env.INSTANTLY_API_KEY) {
    cachedKey = process.env.INSTANTLY_API_KEY;
    return cachedKey;
  }
  const row = unwrap<Pick<IntegrationRow, "api_key"> | null>(
    await supabase().from("integrations").select("api_key").eq("name", "instantly").maybeSingle(),
  );
  cachedKey = row?.api_key ?? null;
  return cachedKey;
}

export async function isConfigured(): Promise<boolean> {
  return (await getInstantlyKey()) !== null;
}

async function api<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const key = await getInstantlyKey();
  if (!key) throw new Error("Instantly API key is not configured");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Instantly ${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

const WEEKDAY_TO_INSTANTLY: Record<string, string> = {
  Sun: "0",
  Mon: "1",
  Tue: "2",
  Wed: "3",
  Thu: "4",
  Fri: "5",
  Sat: "6",
};

function instantlySchedule(schedule: Campaign["schedule"]) {
  const days: Record<string, boolean> = {};
  for (const [name, idx] of Object.entries(WEEKDAY_TO_INSTANTLY)) {
    days[idx] = schedule.days.includes(name as Campaign["schedule"]["days"][number]);
  }
  return {
    schedules: [
      {
        name: "KC schedule",
        timing: { from: schedule.windowStart, to: schedule.windowEnd },
        days,
        timezone: schedule.timezone,
      },
    ],
  };
}

interface InstantlyIds {
  personalized?: string;
  steps?: Record<string, string>;
}

async function createInstantlyCampaign(
  name: string,
  schedule: Campaign["schedule"],
  subject: string,
  body: string,
): Promise<string> {
  const created = await api<{ id: string }>("/campaigns", {
    name,
    campaign_schedule: instantlySchedule(schedule),
    sequences: [
      {
        steps: [
          {
            type: "email",
            delay: 0,
            delay_unit: "days",
            variants: [{ subject, body }],
          },
        ],
      },
    ],
  });
  await api(`/campaigns/${created.id}/activate`, {});
  return created.id;
}

/**
 * Ensures the Instantly campaigns backing a KC campaign exist and are active.
 * No-op (returns null) when the key is missing. Persists ids to
 * campaigns.instantly_ids.
 */
export async function ensureCampaignScaffolding(
  campaign: Campaign,
  steps: SequenceStep[],
): Promise<InstantlyIds | null> {
  if (!(await isConfigured())) return null;

  const row = unwrap<Pick<CampaignRow, "instantly_ids"> | null>(
    await supabase().from("campaigns").select("instantly_ids").eq("id", campaign.id).maybeSingle(),
  );
  const ids: InstantlyIds = (row?.instantly_ids as InstantlyIds) ?? {};
  ids.steps = ids.steps ?? {};

  if (!ids.personalized) {
    ids.personalized = await createInstantlyCampaign(
      `KC · ${campaign.name}`,
      campaign.schedule,
      "{{kc_subject}}",
      "{{kc_body}}",
    );
  }

  for (const step of steps) {
    if (step.channel !== "email" || step.copySource !== "instantly") continue;
    if (ids.steps[step.id]) continue;
    ids.steps[step.id] = await createInstantlyCampaign(
      `KC · ${campaign.name} · step ${step.stepOrder}`,
      campaign.schedule,
      step.subjectTemplate || "{{firstName}}",
      step.bodyTemplate || "",
    );
  }

  unwrap(
    await supabase()
      .from("campaigns")
      .update({ instantly_ids: ids })
      .eq("id", campaign.id)
      .select("id"),
  );
  return ids;
}

export type DispatchResult = { externalId: string } | { pending: true };

/**
 * Dispatches one email touch. Adds the lead to the appropriate Instantly
 * campaign with the resolved copy as custom variables. Returns {pending: true}
 * when no API key is configured.
 */
export async function dispatchEmail(args: {
  campaign: Campaign;
  lead: Lead;
  step: SequenceStep;
  copy: { subject: string; body: string };
}): Promise<DispatchResult> {
  if (!(await isConfigured())) return { pending: true };
  if (!args.lead.email) throw new Error(`Lead ${args.lead.id} has no email`);

  const ids = (unwrap<Pick<CampaignRow, "instantly_ids"> | null>(
    await supabase()
      .from("campaigns")
      .select("instantly_ids")
      .eq("id", args.campaign.id)
      .maybeSingle(),
  )?.instantly_ids ?? {}) as InstantlyIds;

  const targetCampaignId =
    args.step.copySource === "instantly" ? ids.steps?.[args.step.id] : ids.personalized;
  if (!targetCampaignId) {
    throw new Error(
      `No Instantly campaign scaffolding for KC campaign ${args.campaign.id} — relaunch the campaign`,
    );
  }

  const [firstName, ...rest] = args.lead.name.split(" ");
  const created = await api<{ id: string }>("/leads", {
    campaign: targetCampaignId,
    email: args.lead.email,
    first_name: firstName,
    last_name: rest.join(" "),
    company_name: args.lead.company,
    custom_variables: {
      kc_subject: args.copy.subject,
      kc_body: args.copy.body,
    },
    skip_if_in_campaign: true,
  });
  return { externalId: created.id };
}

/** Mirrors KC campaign pause/resume onto the backing Instantly campaigns. */
export async function setInstantlyCampaignStatus(
  instantlyIds: Record<string, unknown>,
  action: "activate" | "pause",
): Promise<void> {
  if (!(await isConfigured())) return;
  const ids = instantlyIds as InstantlyIds;
  const all = [ids.personalized, ...Object.values(ids.steps ?? {})].filter(
    (id): id is string => Boolean(id),
  );
  await Promise.allSettled(all.map((id) => api(`/campaigns/${id}/${action}`, {})));
}
