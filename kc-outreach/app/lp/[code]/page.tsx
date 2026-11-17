import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Crown } from "lucide-react";
import { getLandingPost, recordLandingEvent } from "@/lib/social";
import { LandingForm } from "./lp-form";

// Public lead-capture page for one social post (no dashboard chrome, no auth —
// /lp is a public prefix in proxy.ts). getLandingPost selects only public-safe
// columns; nothing else from the outreach schema is reachable here.

export const dynamic = "force-dynamic";

const BOT_UA = /bot|crawler|spider|facebookexternalhit|facebot|linkedinbot|embedly|preview|slurp/i;

export async function generateMetadata({ params }: PageProps<"/lp/[code]">): Promise<Metadata> {
  const { code } = await params;
  const post = await getLandingPost(code);
  if (!post) return { title: "King Circle AI" };
  const title = post.headline || "King Circle AI";
  const description = post.body.slice(0, 200) || "AI systems that answer, book and follow up for your business.";
  // These OG tags are what Facebook / LinkedIn render as the link-preview card.
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, siteName: "King Circle AI", type: "website" },
  };
}

export default async function LandingPage({ params }: PageProps<"/lp/[code]">) {
  const { code } = await params;
  const post = await getLandingPost(code);
  if (!post) notFound();

  // Count real visits only: link-preview crawlers hit this page too.
  const ua = (await headers()).get("user-agent") ?? "";
  if (!BOT_UA.test(ua)) {
    after(() => recordLandingEvent(post.trackingCode, "view").catch(() => {}));
  }

  return (
    <main className="bg-throne flex min-h-screen flex-col items-center px-4 py-12 sm:py-20">
      <div className="flex items-center gap-3 pb-10">
        <div className="flex size-9 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
          <Crown className="size-4 text-gold" />
        </div>
        <div className="heading-display text-[15px] tracking-[0.08em] text-foreground">KING CIRCLE AI</div>
      </div>

      <div className="w-full max-w-xl">
        <h1 className="heading-display pb-4 text-center text-3xl leading-tight text-foreground sm:text-4xl">
          {post.headline || "Let's build your AI front desk"}
        </h1>
        {post.body && (
          <p className="whitespace-pre-line pb-8 text-center text-base text-muted-foreground">{post.body}</p>
        )}
        <div className="gold-hairline rounded-xl border border-border bg-card p-6 sm:p-8">
          <LandingForm code={post.trackingCode} cta={post.cta} />
        </div>
      </div>
    </main>
  );
}
