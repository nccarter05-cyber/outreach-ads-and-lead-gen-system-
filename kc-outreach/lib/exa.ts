import "server-only";
import type { Lead } from "./types";

// Lead enrichment via Exa AI search. Exa does not return emails — contact
// data comes from the lead-sourcing front door; this fills in company context.

interface ExaResult {
  title?: string;
  url?: string;
  summary?: string;
  text?: string;
  highlights?: string[];
}

interface ExaResponse {
  results: ExaResult[];
}

export interface EnrichmentResult {
  summary: string;
  industry: string;
  companySize: string;
  website: string;
  signals: string[];
  exaData: unknown;
}

export async function enrichLead(lead: Lead): Promise<EnrichmentResult> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error("EXA_API_KEY is not set — add it to .env.local");
  }

  const query = `${lead.company} ${lead.location} — company overview, services, size, and recent activity`;
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: 5,
      type: "auto",
      contents: {
        summary: {
          query: `What does ${lead.company} do? Industry, approximate company size, website, and any buying signals (hiring, growth, pain points, tech gaps).`,
        },
        highlights: { numSentences: 2, highlightsPerUrl: 2 },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Exa search failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as ExaResponse;

  const summaries = data.results
    .map((r) => r.summary)
    .filter((s): s is string => Boolean(s));
  const highlights = data.results.flatMap((r) => r.highlights ?? []);
  const website =
    data.results
      .map((r) => r.url ?? "")
      .map((u) => {
        try {
          return new URL(u).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })
      .find((h) => h && !GENERIC_HOSTS.some((g) => h.endsWith(g))) ?? "";

  return {
    summary: summaries.slice(0, 2).join(" ").slice(0, 1500),
    industry: "",
    companySize: "",
    website,
    signals: highlights.slice(0, 5).map((h) => h.trim().slice(0, 140)),
    exaData: data,
  };
}

const GENERIC_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "yelp.com",
  "google.com",
  "yellowpages.com",
  "bbb.org",
  "mapquest.com",
];
