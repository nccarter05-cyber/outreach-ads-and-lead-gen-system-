import Link from "next/link";
import { Users, Megaphone, Send, MessageSquareReply, CalendarCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ChannelIcon } from "@/components/channel-icon";
import { TouchStatusBadge, CampaignStatusBadge } from "@/components/status-badge";
import { getCampaigns, getDailySends, getLeads, getOutreachLogs, getSequences } from "@/lib/queries";
import { channelLabels, type Channel } from "@/lib/types";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function CommandCenterPage() {
  const [campaigns, leads, outreachLogs, dailySends, sequences] = await Promise.all([
    getCampaigns(),
    getLeads(),
    getOutreachLogs(200),
    getDailySends(14),
    getSequences(),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const totalSent = campaigns.reduce((n, c) => n + c.stats.sent, 0);
  const totalReplied = campaigns.reduce((n, c) => n + c.stats.replied, 0);
  const totalBooked = campaigns.reduce((n, c) => n + c.stats.booked, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const replyRate = totalSent ? Math.round((totalReplied / totalSent) * 100) : 0;

  const channelCounts = outreachLogs.reduce<Record<Channel, number>>(
    (acc, log) => {
      acc[log.channel] += 1;
      return acc;
    },
    { email: 0, linkedin: 0, facebook: 0, instagram: 0 }
  );
  const maxChannel = Math.max(1, ...Object.values(channelCounts));

  const maxDaily = Math.max(1, ...dailySends.map((d) => d.email + d.dm));
  const recentLogs = outreachLogs.slice(0, 7);

  return (
    <>
      <PageHeader
        eyebrow="Command Center"
        title="The Realm at a Glance"
        description="Outreach performance across every channel."
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Leads" value={String(leads.length)} sub="in pipeline" icon={Users} />
        <StatCard
          label="Active Campaigns"
          value={String(activeCampaigns)}
          sub={`${campaigns.length} total`}
          icon={Megaphone}
        />
        <StatCard label="Touches Sent" value={String(totalSent)} sub="all channels" icon={Send} />
        <StatCard
          label="Reply Rate"
          value={`${replyRate}%`}
          sub={`${totalReplied} replies`}
          icon={MessageSquareReply}
        />
        <StatCard
          label="Booked"
          value={String(totalBooked)}
          sub="calls on calendar"
          icon={CalendarCheck}
          featured
        />
      </div>

      <div className="grid gap-4 pt-4 lg:grid-cols-3">
        {/* Sends over time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="label-caps text-muted-foreground">
              Touches — Last 14 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-2">
              {dailySends.map((d) => {
                const total = d.email + d.dm;
                return (
                  <div key={d.date} className="group flex flex-1 flex-col items-center gap-2">
                    <div
                      className="flex w-full flex-col justify-end gap-px"
                      style={{ height: "150px" }}
                      title={`${d.date}: ${d.email} email, ${d.dm} DM`}
                    >
                      <div
                        className="w-full rounded-t-sm bg-gold/35 transition-colors group-hover:bg-gold/60"
                        style={{ height: `${(d.dm / maxDaily) * 100}%` }}
                      />
                      <div
                        className="w-full rounded-b-sm bg-gold transition-colors group-hover:bg-gold-bright"
                        style={{ height: `${(d.email / maxDaily) * 100}%` }}
                      />
                      {total === 0 && <div className="h-px w-full bg-border" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 [writing-mode:initial]">
                      {d.date.split(" ")[1]}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-gold" /> Email
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-gold/35" /> DMs
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Channel breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="label-caps text-muted-foreground">
              Channel Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(Object.keys(channelCounts) as Channel[]).map((channel) => (
              <div key={channel}>
                <div className="flex items-center justify-between pb-1.5 text-sm">
                  <span className="flex items-center gap-2 text-foreground/90">
                    <ChannelIcon channel={channel} />
                    {channelLabels[channel]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {channelCounts[channel]}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${(channelCounts[channel] / maxChannel) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 pt-4 lg:grid-cols-3">
        {/* Campaign performance */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="label-caps text-muted-foreground">
              Campaign Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {campaigns.length === 0 && (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                No campaigns yet — create one from the Campaigns page.
              </p>
            )}
            {campaigns.map((c, i) => {
              const seq = sequences.find((s) => s.id === c.sequenceId);
              const rate = c.stats.sent
                ? Math.round((c.stats.replied / c.stats.sent) * 100)
                : 0;
              return (
                <div key={c.id}>
                  {i > 0 && <Separator className="my-2" />}
                  <Link
                    href="/campaigns"
                    className="group flex items-center justify-between gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-foreground group-hover:text-gold">
                        {c.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {seq?.name} · {c.leadIds.length} leads
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-5">
                      <div className="hidden text-right sm:block">
                        <div className="font-mono text-sm text-foreground">{c.stats.sent}</div>
                        <div className="text-[10px] text-muted-foreground">sent</div>
                      </div>
                      <div className="hidden text-right sm:block">
                        <div className="font-mono text-sm text-foreground">{rate}%</div>
                        <div className="text-[10px] text-muted-foreground">reply</div>
                      </div>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                  </Link>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="label-caps text-muted-foreground">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3.5">
            {recentLogs.length === 0 && (
              <p className="text-sm text-muted-foreground">No outreach activity yet.</p>
            )}
            {recentLogs.map((log) => {
              const lead = leadById.get(log.leadId);
              return (
                <Link
                  key={log.id}
                  href={`/leads/${log.leadId}`}
                  className="group flex items-start gap-3"
                >
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <ChannelIcon channel={log.channel} className="size-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-foreground group-hover:text-gold">
                        {lead?.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatRelative(log.at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <TouchStatusBadge status={log.status} className="px-1.5 py-0 text-[10px]" />
                      <span className="truncate text-xs text-muted-foreground">
                        {lead?.company}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
