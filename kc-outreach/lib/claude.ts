import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Enrichment, Lead } from "./types";

// Copy generation via Claude Sonnet 5. Sonnet 5 rejects temperature/top_p;
// thinking is disabled explicitly to keep per-lead generation fast and cheap.

export const COPY_MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local");
    }
    client = new Anthropic();
  }
  return client;
}

function leadContext(lead: Lead, enrichment?: Enrichment): string {
  const lines = [
    `Name: ${lead.name}`,
    `Company: ${lead.company}`,
    `Title: ${lead.title}`,
    `Location: ${lead.location}`,
  ];
  if (enrichment) {
    lines.push(
      `Industry: ${enrichment.industry}`,
      `Company size: ${enrichment.companySize}`,
      `Research summary: ${enrichment.summary}`,
      `Signals: ${enrichment.signals.join("; ")}`,
    );
  }
  return lines.join("\n");
}

const SYSTEM = `You write outreach copy for King Circle AI, an AI-first company (owner: Nate Carter) that builds intelligent products, agentic workflows, and automation systems for businesses — AI receptionists, lead-response agents, booking automation, reporting agents, and custom AI builds.

Rules:
- Personalize using the lead research provided; reference concrete, specific details.
- Sound like a founder writing personally, never like a template or marketing blast.
- No placeholder brackets — every output must be ready to send as-is.
- Sign emails as "Nate, King Circle AI".`;

async function generateJson<T>(prompt: string, schema: Record<string, unknown>, maxTokens: number): Promise<T> {
  const response = await anthropic().messages.create({
    model: COPY_MODEL,
    max_tokens: maxTokens,
    system: SYSTEM,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Copy generation was refused by the model");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Copy generation returned no text");
  }
  return JSON.parse(text.text) as T;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export async function generateEmailCopy(args: {
  lead: Lead;
  enrichment?: Enrichment;
  prompt: string;
  channel: string;
}): Promise<GeneratedEmail> {
  const isEmail = args.channel === "email";
  return generateJson<GeneratedEmail>(
    `Write a personalized ${isEmail ? "cold email" : `${args.channel} DM`} for this lead.

Lead:
${leadContext(args.lead, args.enrichment)}

Instructions for this touch:
${args.prompt}

${isEmail ? "Return a subject line and body." : "Return the message body only; set subject to an empty string."}`,
    {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject line; empty string for DMs" },
        body: { type: "string", description: "The message body, ready to send" },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
    2048,
  );
}

export interface StructuredEnrichment {
  summary: string;
  industry: string;
  companySize: string;
  signals: string[];
}

/** Turns raw Exa search text into the structured lead_enrichments fields. */
export async function structureEnrichment(args: {
  lead: Lead;
  rawText: string;
}): Promise<StructuredEnrichment> {
  return generateJson<StructuredEnrichment>(
    `Below are raw web-research results about a lead's company. Distill them into structured enrichment data. Only state facts supported by the research; if something is unknown, use an empty string.

Lead:
${leadContext(args.lead)}

Research results:
${args.rawText.slice(0, 8000)}`,
    {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "2-3 sentence overview of the company and any outreach-relevant pain points",
        },
        industry: { type: "string", description: "e.g. 'Roofing / Home Services'" },
        companySize: {
          type: "string",
          description: "Employee range like '2-10', '11-50', '51-200'; empty if unknown",
        },
        signals: {
          type: "array",
          items: { type: "string" },
          description: "Up to 5 short buying signals (hiring, growth, gaps, pain points)",
        },
      },
      required: ["summary", "industry", "companySize", "signals"],
      additionalProperties: false,
    },
    2048,
  );
}

export interface GeneratedCallScript {
  opener: string;
  valueProp: string;
  questions: string[];
  close: string;
}

export async function generateCallScript(args: {
  lead: Lead;
  enrichment?: Enrichment;
}): Promise<GeneratedCallScript> {
  return generateJson<GeneratedCallScript>(
    `Write a personalized cold-call script for this lead.

Lead:
${leadContext(args.lead, args.enrichment)}

The script needs: a natural opener (under 30 seconds, references something specific about their business), a value proposition tied to their likely pain point, 3 discovery questions, and a close that proposes a concrete next step with two time options.`,
    {
      type: "object",
      properties: {
        opener: { type: "string" },
        valueProp: { type: "string" },
        questions: { type: "array", items: { type: "string" } },
        close: { type: "string" },
      },
      required: ["opener", "valueProp", "questions", "close"],
      additionalProperties: false,
    },
    4096,
  );
}
