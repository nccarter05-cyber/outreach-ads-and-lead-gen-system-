"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Unplug,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ChannelIcon } from "@/components/channel-icon";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  deleteSocialPost,
  disconnectSocialAccount,
  duplicateSocialPost,
  generateSocialPostCopy,
  publishSocialPostNow,
  runSocialTickNow,
  saveSocialPost,
  unscheduleSocialPost,
} from "@/app/actions/social";
import {
  socialCharLimits,
  socialPlatformLabels,
  socialPlatforms,
  type Segment,
  type SocialAccount,
  type SocialAccountStatus,
  type SocialLinkType,
  type SocialPlatform,
  type SocialPost,
  type SocialPostStatus,
} from "@/lib/types";

interface Config {
  meta: boolean;
  linkedin: boolean;
  appUrl: string | null;
}

const postStatusStyles: Record<SocialPostStatus, string> = {
  draft: "bg-secondary text-muted-foreground",
  scheduled: "bg-gold/10 text-gold border-gold/25",
  publishing: "bg-sky-400/10 text-sky-300 border-sky-400/20",
  published: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  failed: "bg-destructive/10 text-destructive/90 border-destructive/20",
};

const accountStatusStyles: Record<SocialAccountStatus, string> = {
  active: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  expired: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  error: "bg-destructive/10 text-destructive/90 border-destructive/20",
  disconnected: "bg-secondary text-muted-foreground",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** ISO -> value for <input type="datetime-local"> in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Draft {
  id?: string;
  platform: SocialPlatform;
  accountId: string | null;
  brief: string;
  content: string;
  linkType: SocialLinkType;
  linkUrl: string;
  landingHeadline: string;
  landingBody: string;
  landingCta: string;
  segmentId: string | null;
  scheduledLocal: string;
}

function emptyDraft(platform: SocialPlatform, accounts: SocialAccount[]): Draft {
  return {
    platform,
    accountId: accounts.find((a) => a.platform === platform && a.status === "active")?.id ?? null,
    brief: "",
    content: "",
    linkType: "landing",
    linkUrl: "",
    landingHeadline: "",
    landingBody: "",
    landingCta: "Book a free call",
    segmentId: null,
    scheduledLocal: "",
  };
}

function draftFromPost(p: SocialPost): Draft {
  return {
    id: p.id,
    platform: p.platform,
    accountId: p.accountId,
    brief: "",
    content: p.content,
    linkType: p.linkType,
    linkUrl: p.linkUrl ?? "",
    landingHeadline: p.landingHeadline,
    landingBody: p.landingBody,
    landingCta: p.landingCta,
    segmentId: p.segmentId,
    scheduledLocal: toLocalInput(p.scheduledAt),
  };
}

type Filter = "all" | SocialPostStatus;

export function SocialClient({
  accounts,
  posts,
  segments,
  config,
  flash,
}: {
  accounts: SocialAccount[];
  posts: SocialPost[];
  segments: Segment[];
  config: Config;
  flash: { connected: string | null; n: string | null; error: string | null };
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("facebook", accounts));
  const [saving, startSaving] = useTransition();
  const [generating, startGenerating] = useTransition();
  const [running, startRunning] = useTransition();
  const [busy, startBusy] = useTransition();

  // OAuth callbacks redirect back here with ?connected= / ?error=.
  useEffect(() => {
    if (flash.connected) {
      toast.success(
        `${flash.connected === "meta" ? "Meta" : "LinkedIn"} connected — ${flash.n ?? "?"} account(s) saved`,
      );
    }
    if (flash.error) toast.error(flash.error, { duration: 10000 });
    if (flash.connected || flash.error) router.replace("/social");
  }, [flash.connected, flash.n, flash.error, router]);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const segmentById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);
  const visible = filter === "all" ? posts : posts.filter((p) => p.status === filter);
  const counts = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function openNew(platform: SocialPlatform = "facebook") {
    setDraft(emptyDraft(platform, accounts));
    setComposerOpen(true);
  }

  function openEdit(p: SocialPost) {
    setDraft(draftFromPost(p));
    setComposerOpen(true);
  }

  function changePlatform(platform: SocialPlatform) {
    setDraft((d) => ({
      ...d,
      platform,
      accountId: accounts.find((a) => a.platform === platform && a.status === "active")?.id ?? null,
    }));
  }

  function generate() {
    startGenerating(async () => {
      const res = await generateSocialPostCopy({
        platform: draft.platform,
        brief: draft.brief,
        segmentId: draft.segmentId,
        withLanding: draft.linkType === "landing",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDraft((d) => ({
        ...d,
        content: res.copy.content,
        ...(d.linkType === "landing"
          ? {
              landingHeadline: res.copy.landingHeadline,
              landingBody: res.copy.landingBody,
              landingCta: res.copy.landingCta || d.landingCta,
            }
          : {}),
      }));
    });
  }

  function save(intent: "draft" | "schedule") {
    if (!draft.content.trim()) {
      toast.error("Write (or generate) the post first");
      return;
    }
    if (intent === "schedule" && !draft.scheduledLocal) {
      toast.error("Pick a date and time to schedule");
      return;
    }
    startSaving(async () => {
      const res = await saveSocialPost({
        id: draft.id,
        platform: draft.platform,
        accountId: draft.accountId,
        content: draft.content,
        linkType: draft.linkType,
        linkUrl: draft.linkType === "custom" ? draft.linkUrl.trim() : null,
        landingHeadline: draft.landingHeadline,
        landingBody: draft.landingBody,
        landingCta: draft.landingCta,
        segmentId: draft.segmentId,
        scheduledAt: draft.scheduledLocal ? new Date(draft.scheduledLocal).toISOString() : null,
        intent,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save post");
        return;
      }
      if (res.warning) toast.warning(`Saved as draft: ${res.warning}`, { duration: 10000 });
      else toast.success(res.status === "scheduled" ? "Post scheduled" : "Draft saved");
      setComposerOpen(false);
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startBusy(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error ?? "Something went wrong");
    });
  }

  function publishNow(p: SocialPost) {
    startBusy(async () => {
      const res = await publishSocialPostNow(p.id);
      const o = res.outcome;
      if (o?.kind === "published") toast.success("Published");
      else if (o?.kind === "draft") toast.warning(o.reason, { duration: 10000 });
      else if (o?.kind === "failed") toast.error(o.error, { duration: 10000 });
      else toast.error(res.error ?? "Publish failed");
    });
  }

  function runTick() {
    startRunning(async () => {
      const res = await runSocialTickNow();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const r = res.result;
      toast.success(
        `Social tick: ${r.published} published, ${r.failed} failed, ${r.backToDraft} back to draft, ${r.metricsRefreshed} metrics refreshed`,
        { duration: 8000 },
      );
      if (r.notes.length) toast.info(r.notes.join(" · "), { duration: 10000 });
    });
  }

  function copyLanding(p: SocialPost) {
    if (!config.appUrl) {
      toast.error("Set APP_URL to get shareable landing links");
      return;
    }
    navigator.clipboard
      .writeText(`${config.appUrl}/lp/${p.trackingCode}`)
      .then(() => toast.success("Landing link copied"))
      .catch(() => toast.error("Couldn't copy"));
  }

  const platformAccounts = accounts.filter((a) => a.platform === draft.platform);
  const limit = socialCharLimits[draft.platform];
  const over = draft.content.length > limit;
  const selectedAccount = draft.accountId ? accountById.get(draft.accountId) : undefined;
  const scheduleHint =
    draft.platform === "instagram"
      ? "Instagram needs an image to publish (Phase 8.1) — drafts only for now."
      : draft.platform === "linkedin" && !config.linkedin
        ? "LinkedIn is gated until Community Management API access is approved — drafts only."
        : !selectedAccount
          ? `Connect a ${socialPlatformLabels[draft.platform]} account to schedule.`
          : selectedAccount.status !== "active"
            ? `${selectedAccount.name} is ${selectedAccount.status} — reconnect it to schedule.`
            : null;

  return (
    <>
      <PageHeader
        eyebrow="Social"
        title="Organic Posts"
        description={`${counts.published ?? 0} published · ${counts.scheduled ?? 0} scheduled · ${counts.draft ?? 0} drafts`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/social/performance">
                <BarChart3 data-icon="inline-start" />
                Performance
              </Link>
            </Button>
            <Button variant="outline" onClick={runTick} disabled={running}>
              <Zap data-icon="inline-start" />
              {running ? "Running…" : "Publish due posts"}
            </Button>
            <Button onClick={() => openNew()}>
              <Plus data-icon="inline-start" />
              New Post
            </Button>
          </div>
        }
      />

      {/* Connected accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="label-caps text-muted-foreground">Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {socialPlatforms.map((platform, i) => {
            const list = accounts.filter((a) => a.platform === platform);
            const configured = platform === "linkedin" ? config.linkedin : config.meta;
            const connectHref = platform === "linkedin" ? "/api/oauth/linkedin" : "/api/oauth/meta";
            return (
              <div key={platform}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex flex-wrap items-start justify-between gap-3 px-1 py-1">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <ChannelIcon channel={platform} className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">{socialPlatformLabels[platform]}</div>
                      {list.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          {!configured
                            ? platform === "linkedin"
                              ? "Awaiting Community Management API approval — LinkedIn posts save as drafts."
                              : "Meta app not configured (META_APP_ID / META_APP_SECRET)."
                            : platform === "instagram"
                              ? "Connects through Meta: link an IG Business account to your Facebook Page."
                              : "No account connected."}
                        </div>
                      )}
                      {list.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <span className="text-foreground/90">{a.name}</span>
                          {a.handle && <span className="text-muted-foreground">@{a.handle}</span>}
                          <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", accountStatusStyles[a.status])}>
                            {cap(a.status)}
                          </Badge>
                          {a.tokenExpiresAt && a.status === "active" && (
                            <span className="text-muted-foreground/70">
                              token until {new Date(a.tokenExpiresAt).toLocaleDateString()}
                            </span>
                          )}
                          {a.lastError && a.status !== "active" && (
                            <span className="max-w-md truncate text-destructive/80" title={a.lastError}>
                              {a.lastError}
                            </span>
                          )}
                          {a.status !== "disconnected" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (confirm(`Disconnect ${a.name}? Scheduled posts for it will fall back to drafts.`)) {
                                  act(() => disconnectSocialAccount(a.id), "Account disconnected");
                                }
                              }}
                              className="flex items-center gap-1 text-muted-foreground hover:text-destructive"
                            >
                              <Unplug className="size-3" />
                              Disconnect
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {platform !== "instagram" && (
                    <Button variant="outline" size="sm" asChild={configured} disabled={!configured}>
                      {configured ? (
                        <a href={connectHref}>
                          <Link2 data-icon="inline-start" />
                          {list.length ? "Reconnect" : "Connect"}
                        </a>
                      ) : (
                        <span>
                          <Link2 data-icon="inline-start" />
                          Connect
                        </span>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5 pt-6 pb-3">
        {(["all", "draft", "scheduled", "published", "failed"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-lg border px-3 py-1 text-xs transition-colors",
              filter === f
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-border text-muted-foreground hover:bg-accent/50",
            )}
          >
            {f === "all" ? "All" : cap(f)}
            <span className="ml-1.5 font-mono opacity-70">{f === "all" ? posts.length : (counts[f] ?? 0)}</span>
          </button>
        ))}
      </div>

      {/* Posts */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {posts.length === 0
              ? "No posts yet — write one, or let Claude draft it from a one-line brief."
              : "No posts with this status."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((p) => {
            const account = p.accountId ? accountById.get(p.accountId) : undefined;
            const segment = p.segmentId ? segmentById.get(p.segmentId) : undefined;
            const editable = p.status === "draft" || p.status === "scheduled" || p.status === "failed";
            const engagement = p.metrics.likes + p.metrics.comments + p.metrics.shares;
            return (
              <Card key={p.id} className={cn("gap-0 py-4", p.status === "scheduled" && "gold-hairline")}>
                <CardContent className="flex gap-4">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <ChannelIcon channel={p.platform} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className={postStatusStyles[p.status]}>
                        {cap(p.status)}
                      </Badge>
                      <span>{account?.name ?? "No account"}</span>
                      {segment && <span>· {segment.name}</span>}
                      <span>
                        ·{" "}
                        {p.status === "published"
                          ? `Published ${formatWhen(p.publishedAt)}`
                          : p.status === "scheduled"
                            ? `Scheduled ${formatWhen(p.scheduledAt)}`
                            : `Created ${formatWhen(p.createdAt)}`}
                      </span>
                      <span>
                        ·{" "}
                        {p.linkType === "landing"
                          ? "Landing page"
                          : p.linkType === "custom"
                            ? "Custom link"
                            : "No link"}
                      </span>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-line pt-2 text-sm text-foreground/90">
                      {p.content || <span className="text-muted-foreground italic">Empty draft</span>}
                    </p>
                    {p.error && (
                      <p className="pt-2 text-xs text-amber-300/90">{p.error}</p>
                    )}
                    {p.status === "published" && (
                      <div className="flex flex-wrap gap-x-5 gap-y-1 pt-3 font-mono text-xs text-muted-foreground">
                        <span><span className="text-foreground">{p.metrics.impressions}</span> impressions</span>
                        <span><span className="text-foreground">{engagement}</span> engagements</span>
                        <span><span className="text-foreground">{p.metrics.clicks}</span> clicks</span>
                        {p.linkType === "landing" && (
                          <span><span className="text-foreground">{p.metrics.landingViews}</span> page views</span>
                        )}
                        <span><span className="text-gold">{p.metrics.leads}</span> leads</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    {editable && (
                      <Button variant="outline" size="sm" onClick={() => openEdit(p)} disabled={busy}>
                        <Pencil data-icon="inline-start" />
                        Edit
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Post actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {editable && (
                          <DropdownMenuItem
                            disabled={busy}
                            onSelect={() => {
                              if (
                                p.status !== "failed" ||
                                confirm("This post failed before. If the error says it may already be live, check the platform first. Publish anyway?")
                              ) {
                                publishNow(p);
                              }
                            }}
                          >
                            <Send /> Publish now
                          </DropdownMenuItem>
                        )}
                        {p.status === "scheduled" && (
                          <DropdownMenuItem
                            disabled={busy}
                            onSelect={() => act(() => unscheduleSocialPost(p.id), "Moved back to drafts")}
                          >
                            <Undo2 /> Unschedule
                          </DropdownMenuItem>
                        )}
                        {p.permalink && (
                          <DropdownMenuItem asChild>
                            <a href={p.permalink} target="_blank" rel="noreferrer">
                              <ExternalLink /> View on {socialPlatformLabels[p.platform]}
                            </a>
                          </DropdownMenuItem>
                        )}
                        {p.linkType === "landing" && (
                          <>
                            <DropdownMenuItem onSelect={() => copyLanding(p)}>
                              <Link2 /> Copy landing link
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a href={`/lp/${p.trackingCode}`} target="_blank" rel="noreferrer">
                                <ExternalLink /> Preview landing page
                              </a>
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        {socialPlatforms
                          .filter((pl) => pl !== p.platform)
                          .map((pl) => (
                            <DropdownMenuItem
                              key={pl}
                              disabled={busy}
                              onSelect={() =>
                                act(() => duplicateSocialPost(p.id, pl), `Copied to a ${socialPlatformLabels[pl]} draft`)
                              }
                            >
                              <Copy /> Duplicate to {socialPlatformLabels[pl]}
                            </DropdownMenuItem>
                          ))}
                        {p.status !== "publishing" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={busy}
                              onSelect={() => {
                                const msg =
                                  p.status === "published"
                                    ? "Delete this post from the dashboard? It stays live on the platform, and its leads lose their post attribution."
                                    : "Delete this post?";
                                if (confirm(msg)) act(() => deleteSocialPost(p.id), "Post deleted");
                              }}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Composer */}
      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="heading-display text-xl">
              {draft.id ? "Edit Post" : "New Post"}
            </DialogTitle>
            <DialogDescription>
              Text + link posts. Each post gets its own landing page, so leads are attributed to it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Platform</Label>
                <Select
                  value={draft.platform}
                  onValueChange={(v) => changePlatform(v as SocialPlatform)}
                  disabled={Boolean(draft.id)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {socialPlatforms.map((pl) => (
                      <SelectItem key={pl} value={pl}>
                        {socialPlatformLabels[pl]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Account</Label>
                <Select
                  value={draft.accountId ?? "none"}
                  onValueChange={(v) => set("accountId", v === "none" ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None yet (draft only)</SelectItem>
                    {platformAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.status !== "active" ? ` (${a.status})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Target audience</Label>
              <Select
                value={draft.segmentId ?? "none"}
                onValueChange={(v) => set("segmentId", v === "none" ? null : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (no segment)</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Steers the AI copy, and leads captured from this post join this segment.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Brief for Claude</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Missed calls cost HVAC shops jobs — our AI receptionist answers 24/7"
                  value={draft.brief}
                  onChange={(e) => set("brief", e.target.value)}
                />
                <Button variant="outline" onClick={generate} disabled={generating}>
                  <Sparkles data-icon="inline-start" />
                  {generating ? "Writing…" : "Generate"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Post</Label>
                <span className={cn("font-mono text-xs", over ? "text-destructive" : "text-muted-foreground")}>
                  {draft.content.length.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
                </span>
              </div>
              <Textarea
                rows={8}
                value={draft.content}
                onChange={(e) => set("content", e.target.value)}
                placeholder="Write the post, or generate it from the brief above."
              />
              {draft.platform === "instagram" && draft.linkType !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Instagram captions can&apos;t contain clickable links — put the landing link in your bio.
                </p>
              )}
            </div>

            <Separator />
            <div className="label-caps text-gold/80">Link</div>

            <div className="flex flex-col gap-2">
              <Select value={draft.linkType} onValueChange={(v) => set("linkType", v as SocialLinkType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="landing">Lead-capture landing page (tracked)</SelectItem>
                  <SelectItem value="custom">Custom URL</SelectItem>
                  <SelectItem value="none">No link</SelectItem>
                </SelectContent>
              </Select>
              {draft.linkType === "landing" && !config.appUrl && (
                <p className="text-xs text-amber-300/90">
                  APP_URL isn&apos;t set, so landing links can&apos;t be published yet.
                </p>
              )}
            </div>

            {draft.linkType === "custom" && (
              <Input
                placeholder="https://kingcircle.ai/…"
                value={draft.linkUrl}
                onChange={(e) => set("linkUrl", e.target.value)}
              />
            )}

            {draft.linkType === "landing" && (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <div className="flex flex-col gap-2">
                  <Label>Landing headline</Label>
                  <Input
                    value={draft.landingHeadline}
                    onChange={(e) => set("landingHeadline", e.target.value)}
                    placeholder="Never miss another after-hours call"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Landing body</Label>
                  <Textarea
                    rows={3}
                    value={draft.landingBody}
                    onChange={(e) => set("landingBody", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Button label</Label>
                  <Input value={draft.landingCta} onChange={(e) => set("landingCta", e.target.value)} />
                </div>
              </div>
            )}

            <Separator />
            <div className="label-caps text-gold/80">Schedule</div>
            <div className="flex flex-col gap-2">
              <Input
                type="datetime-local"
                value={draft.scheduledLocal}
                onChange={(e) => set("scheduledLocal", e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {scheduleHint ??
                  "Your local time. The hourly tick publishes it at or just after this time; a past time goes out on the next tick."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setComposerOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save("draft")} disabled={saving || over}>
              Save Draft
            </Button>
            <Button onClick={() => save("schedule")} disabled={saving || over || Boolean(scheduleHint)}>
              <CalendarClock data-icon="inline-start" />
              {saving ? "Saving…" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
