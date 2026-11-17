import { isConfigured as metaConfigured } from "@/lib/meta";
import { isConfigured as linkedinConfigured } from "@/lib/linkedin";
import { getSegments, getSocialAccounts, getSocialPosts } from "@/lib/queries";
import { SocialClient } from "./social-client";

export default async function SocialPage({ searchParams }: PageProps<"/social">) {
  const [accounts, posts, segments, sp] = await Promise.all([
    getSocialAccounts(),
    getSocialPosts(),
    getSegments(),
    searchParams,
  ]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return (
    <SocialClient
      accounts={accounts}
      posts={posts}
      segments={segments}
      config={{
        meta: metaConfigured(),
        linkedin: linkedinConfigured(),
        appUrl: process.env.APP_URL?.replace(/\/$/, "") || null,
      }}
      flash={{ connected: one(sp.connected), n: one(sp.n), error: one(sp.error) }}
    />
  );
}
