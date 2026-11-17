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

const BRAND = `King Circle AI is an AI-first company (owner: Nate Carter) that builds intelligent products, agentic workflows, and automation systems for businesses — AI receptionists, lead-response agents, booking automation, reporting agents, and custom AI builds.`;

const SYSTEM = `You write outreach copy for King Circle AI. ${BRAND}

Rules:
- Personalize using the lead research provided; reference concrete, specific details.
- Sound like a founder writing personally, never like a template or marketing blast.
- No placeholder brackets — every output must be ready to send as-is.
- Sign emails as "Nate, King Circle AI".`;

const SOCIAL_SYSTEM = `You write organic social media posts for King Circle AI's own company pages. ${BRAND}

Rules:
- Write as the founder (Nate) or the company — confident, plain-spoken, specific. Never hypey, never generic "AI is changing everything" filler.
- Lead with a hook in the first line; it has to earn the "see more" click.
- Only claim what the brief supports. Never invent client names, results, numbers, or testimonials.
- No placeholder brackets — every output must be ready to publish as-is.`;

async function generateJson<T>(
  prompt: string,
  schema: Record<string, unknown>,
  maxTokens: number,
  system: string = SYSTEM,
): Promise<T> {
  const response = await anthropic().messages.create({
    model: COPY_MODEL,
    max_tokens: maxTokens,
    system,
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

export async function generateReplyDraft(args: {
  lead: Lead;
  enrichment?: Enrichment;
  thread: { direction: "inbound" | "outbound"; body: string }[];
}): Promise<GeneratedEmail> {
  const transcript = args.thread
    .map((m) => `${m.direction === "inbound" ? "LEAD" : "NATE"}: ${m.body}`)
    .join("\n\n---\n\n");
  return generateJson<GeneratedEmail>(
    `Draft a reply to the lead's latest message. Keep it short (under 120 words), answer what they asked, and move toward a quick call if they're interested. If they sound uninterested or ask to stop, reply with a brief polite acknowledgement and do not push.

Lead:
${leadContext(args.lead, args.enrichment)}

Conversation so far (oldest first):
${transcript}

Return a subject line (prefix "Re: " if replying to an existing subject) and the reply body.`,
    {
      type: "object",
      properties: {
        subject: { type: "string", description: "Reply subject line" },
        body: { type: "string", description: "The reply, ready to send, signed as Nate" },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
    1024,
  );
}

// ── Phase 8: organic social posts ───────────────────────────────────────────

const SOCIAL_PLATFORM_RULES: Record<"facebook" | "instagram" | "linkedin", string> = {
  facebook:
    "Facebook Page post. Conversational and local-business friendly. 40–120 words, short paragraphs, 0–2 hashtags at most. If there is a link it renders as a preview card below the text, so don't paste the URL into the body; just point to it (\"details below\").",
  instagram:
    "Instagram caption. Hook in the first line (it is truncated after ~125 characters). 60–150 words, line breaks between ideas, then 3–8 relevant hashtags on the last line. Links in captions are NOT clickable — if there's a link, say \"link in bio\". Hard limit 2,200 characters.",
  linkedin:
    "LinkedIn Company Page post. Professional founder voice, insight-led: a sharp opening line, a short story or concrete observation, a takeaway. 100–220 words, single-sentence paragraphs with line breaks, up to 3 hashtags at the end. If there's a link it renders as an article card, so don't paste the URL into the text. Hard limit 3,000 characters.",
};

export interface GeneratedSocialPost {
  content: string;
  landingHeadline: string;
  landingBody: string;
  landingCta: string;
}

/**
 * One post for one platform, plus the copy for its lead-capture landing page
 * (used when the post links to /lp/[code]).
 */
export async function generateSocialCopy(args: {
  platform: "facebook" | "instagram" | "linkedin";
  brief: string;
  audience?: { name: string; description: string; criteria: string[] };
  withLanding: boolean;
}): Promise<GeneratedSocialPost> {
  const audience = args.audience
    ? `Target audience: ${args.audience.name} — ${args.audience.description}${args.audience.criteria.length ? ` (${args.audience.criteria.join("; ")})` : ""}`
    : "Target audience: small and mid-sized business owners.";
  return generateJson<GeneratedSocialPost>(
    `Write one social post.

Platform rules: ${SOCIAL_PLATFORM_RULES[args.platform]}

${audience}

Brief from Nate:
${args.brief}

${
  args.withLanding
    ? "The post links to a lead-capture landing page. Also write that page: a headline (under 12 words) that continues the post's promise, a body (2–4 sentences on what they get by reaching out and what happens next), and a call-to-action button label (2–5 words)."
    : "There is no landing page; set landingHeadline, landingBody and landingCta to empty strings."
}`,
    {
      type: "object",
      properties: {
        content: { type: "string", description: "The post text, ready to publish" },
        landingHeadline: { type: "string" },
        landingBody: { type: "string" },
        landingCta: { type: "string" },
      },
      required: ["content", "landingHeadline", "landingBody", "landingCta"],
      additionalProperties: false,
    },
    2048,
    SOCIAL_SYSTEM,
  );
}
