import Link from "next/link";
import { ArrowLeft, Eye, Heart, MousePointerClick, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChannelIcon } from "@/components/channel-icon";
import { LeadStatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getLeads, getSocialPosts } from "@/lib/queries";
import { socialPlatformLabels, socialPlatforms, type SocialPlatform } from "@/lib/types";

// Standalone post-performance view (same layout language as the Command
// Center). Platform metrics come from the hourly social tick; page views,
// form submissions and leads are first-party (landing page + source_post_id).

const fmt = (n: number) => n.toLocaleString("en-US");

export default async function SocialPerformancePage() {
  const [posts, leads] = await Promise.all([getSocialPosts(), getLeads()]);
  const published = posts.filter((p) => p.status === "published");
  const postById = new Map(posts.map((p) => [p.id, p]));

  const sum = (key: keyof (typeof published)[number]["metrics"], list = published) =>
    list.reduce((n, p) => n + p.metrics[key], 0);
  const engagement = (list = published) => sum("likes", list) + sum("comments", list) + sum("shares", list);

  const totalLeads = posts.reduce((n, p) => n + p.metrics.leads, 0);
  const landingViews = sum("landingViews");
  const conversion = landingViews ? ((sum("formSubmissions") / landingViews) * 100).toFixed(1) : "0";

  const byPlatform = socialPlatforms.map((platform: SocialPlatform) => {
    const list = published.filter((p) => p.platform === platform);
    return {
      platform,
      posts: list.length,
      impressions: sum("impressions", list),
      engagement: engagement(list),
      leads: posts.filter((p) => p.platform === platform).reduce((n, p) => n + p.metrics.leads, 0),
    };
  });
  const maxImpressions = Math.max(1, ...byPlatform.map((b) => b.impressions));

  const topPosts = [...published]
    .sort(
      (a, b) =>
        b.metrics.leads - a.metrics.leads ||
        b.metrics.likes + b.metrics.comments + b.metrics.shares -
          (a.metrics.likes + a.metrics.comments + a.metrics.shares) ||
        b.metrics.impressions - a.metrics.impressions,
    )
    .slice(0, 10);

  const socialLeads = leads.filter((l) => l.sourcePostId).slice(0, 8);
  const lastRefresh = published
    .map((p) => p.metricsUpdatedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();

  return (
    <>
      <PageHeader
        eyebrow="Social"
        title="Post Performance"
        description={
          lastRefresh
            ? `Platform metrics last refreshed ${new Date(lastRefresh).toLocaleString("en-US")}`
            : "Platform metrics refresh hourly once posts are published."
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/social">
              <ArrowLeft data-icon="inline-start" />
              Posts
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Published" value={fmt(published.length)} sub={`${posts.length} posts total`} icon={Send} />
        <StatCard label="Impressions" value={fmt(sum("impressions"))} sub="platform reported" icon={Eye} />
        <StatCard label="Engagements" value={fmt(engagement())} sub="likes · comments · shares" icon={Heart} />
        <StatCard
          label="Page Views"
          value={fmt(landingViews)}
          sub={`${conversion}% filled the form`}
          icon={MousePointerClick}
        />
        <StatCard label="Leads" value={fmt(totalLeads)} sub="attributed to posts" icon={UserPlus} featured />
      </div>

      <div className="grid gap-4 pt-4 lg:grid-cols-3">
        {/* Top posts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="label-caps text-muted-foreground">Top Posts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {topPosts.length === 0 && (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                Nothing published yet — results show up here after the first post goes live.
              </p>
            )}
            {topPosts.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex items-start justify-between gap-4 px-2 py-1">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <ChannelIcon channel={p.platform} className="size-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm text-foreground">{p.content}</p>
                      <div className="pt-0.5 text-xs text-muted-foreground">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-US") : ""}
                        {p.permalink && (
                          <>
                            {" · "}
                            <a href={p.permalink} target="_blank" rel="noreferrer" className="hover:text-gold">
                              view
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-5">
                    <div className="hidden text-right sm:block">
                      <div className="font-mono text-sm text-foreground">{fmt(p.metrics.impressions)}</div>
                      <div className="text-[10px] text-muted-foreground">impr.</div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="font-mono text-sm text-foreground">
                        {fmt(p.metrics.likes + p.metrics.comments + p.metrics.shares)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">eng.</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-gold">{fmt(p.metrics.leads)}</div>
                      <div className="text-[10px] text-muted-foreground">leads</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Platform breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="label-caps text-muted-foreground">By Platform</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {byPlatform.map((b) => (
              <div key={b.platform}>
                <div className="flex items-center justify-between pb-1.5 text-sm">
                  <span className="flex items-center gap-2 text-foreground/90">
                    <ChannelIcon channel={b.platform} />
                    {socialPlatformLabels[b.platform]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {b.posts} posts · {fmt(b.leads)} leads
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${(b.impressions / maxImpressions) * 100}%` }}
                  />
                </div>
                <div className="pt-1 font-mono text-[10px] text-muted-foreground">
                  {fmt(b.impressions)} impressions · {fmt(b.engagement)} engagements
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Captured leads */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="label-caps text-muted-foreground">Leads From Social</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {socialLeads.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No leads captured yet. Posts that link to their landing page attribute every form fill here.
            </p>
          )}
          {socialLeads.map((l, i) => {
            const post = l.sourcePostId ? postById.get(l.sourcePostId) : undefined;
            return (
              <div key={l.id}>
                {i > 0 && <Separator className="my-2" />}
                <Link
                  href={`/leads/${l.id}`}
                  className="group flex items-center justify-between gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground group-hover:text-gold">{l.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {l.company || l.email}
                      {post && ` · from ${socialPlatformLabels[post.platform]}: “${post.content.slice(0, 60)}…”`}
                    </div>
                  </div>
                  <LeadStatusBadge status={l.status} />
                </Link>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
