import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Globe,
  Sparkles,
  Wand2,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { ChannelIcon } from "@/components/channel-icon";
import { LeadStatusBadge, TouchStatusBadge } from "@/components/status-badge";
import {
  channelLabels,
  getCampaignsForLead,
  getCopyForLead,
  getLead,
  getLogsForLead,
  getSegment,
  sourceLabels,
  type Channel,
} from "@/lib/data";

function initials(name: string): string {
  return name
    .split(" ")
    .filter((p) => /^[A-Z]/.test(p))
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const channels: Channel[] = ["email", "linkedin", "facebook", "instagram"];

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = getLead(id);
  if (!lead) notFound();

  const logs = getLogsForLead(lead.id);
  const copies = getCopyForLead(lead.id);
  const leadCampaigns = getCampaignsForLead(lead.id);

  return (
    <>
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
      >
        <ArrowLeft className="size-3.5" />
        All leads
      </Link>

      <PageHeader
        eyebrow={lead.company}
        title={lead.name}
        description={`${lead.title} · ${lead.location}`}
        actions={
          <>
            <Button variant="outline">
              <Sparkles data-icon="inline-start" />
              {lead.enrichment ? "Re-enrich" : "Enrich"}
            </Button>
            <Button variant="outline">
              <Megaphone data-icon="inline-start" />
              Add to Campaign
            </Button>
            <Button>
              <Wand2 data-icon="inline-start" />
              Generate Copy
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Identity / contact */}
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="heading-display flex size-14 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-lg text-gold">
                  {initials(lead.name)}
                </div>
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    <LeadStatusBadge status={lead.status} />
                    <Badge
                      variant="outline"
                      className="border-gold/20 bg-gold/5 font-normal text-gold/80"
                    >
                      {getSegment(lead.segmentId)?.name}
                    </Badge>
                  </div>
                  <div className="pt-1.5 text-xs text-muted-foreground">
                    Source: {sourceLabels[lead.source]}
                  </div>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col gap-2.5 text-sm">
                {lead.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="size-3.5 text-gold/80" />
                    <span className="font-mono text-xs">{lead.email}</span>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="size-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{lead.phone}</span>
                  </div>
                )}
                {lead.linkedinUrl && (
                  <div className="flex items-center gap-2.5">
                    <ChannelIcon channel="linkedin" />
                    <span className="font-mono text-xs">{lead.linkedinUrl}</span>
                  </div>
                )}
                {lead.facebookUrl && (
                  <div className="flex items-center gap-2.5">
                    <ChannelIcon channel="facebook" />
                    <span className="font-mono text-xs">{lead.facebookUrl}</span>
                  </div>
                )}
                {lead.instagramUrl && (
                  <div className="flex items-center gap-2.5">
                    <ChannelIcon channel="instagram" />
                    <span className="font-mono text-xs">{lead.instagramUrl}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{lead.location}</span>
                </div>
              </div>
              {leadCampaigns.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="label-caps pb-2 text-muted-foreground">Campaigns</div>
                    <div className="flex flex-wrap gap-1.5">
                      {leadCampaigns.map((c) => (
                        <Badge key={c.id} variant="secondary" className="font-normal">
                          {c.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Enrichment */}
          <Card className={lead.enrichment ? "gold-hairline" : undefined}>
            <CardHeader>
              <CardTitle className="label-caps flex items-center gap-2 text-muted-foreground">
                <Sparkles className="size-3.5 text-gold" />
                Enrichment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.enrichment ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {lead.enrichment.summary}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Industry</div>
                      <div className="pt-0.5 text-foreground">{lead.enrichment.industry}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Size</div>
                      <div className="pt-0.5 text-foreground">{lead.enrichment.companySize}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-muted-foreground">Website</div>
                      <div className="flex items-center gap-1.5 pt-0.5 font-mono text-foreground">
                        <Globe className="size-3 text-muted-foreground" />
                        {lead.enrichment.website}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="label-caps pb-2 text-muted-foreground">Signals</div>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.enrichment.signals.map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="border-gold/25 bg-gold/5 font-normal text-gold/90"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Not enriched yet. Run Exa AI enrichment to pull company
                    context and buying signals.
                  </p>
                  <Button variant="outline" size="sm">
                    <Sparkles data-icon="inline-start" />
                    Enrich Now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: copy + timeline */}
        <Card className="lg:col-span-2">
          <CardContent>
            <Tabs defaultValue="copy">
              <TabsList>
                <TabsTrigger value="copy">AI Copy</TabsTrigger>
                <TabsTrigger value="timeline">
                  Outreach Timeline
                  <Badge variant="secondary" className="ml-1.5 px-1.5 text-[10px]">
                    {logs.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="copy" className="pt-4">
                <Tabs defaultValue="email">
                  <TabsList>
                    {channels.map((ch) => (
                      <TabsTrigger key={ch} value={ch} className="gap-1.5">
                        <ChannelIcon channel={ch} colored={false} className="size-3.5" />
                        {channelLabels[ch]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {channels.map((ch) => {
                    const copy = copies.find((c) => c.channel === ch);
                    return (
                      <TabsContent key={ch} value={ch} className="pt-4">
                        {copy ? (
                          <div className="flex flex-col gap-3">
                            {copy.subject && (
                              <div className="rounded-lg border bg-background/50 px-4 py-2.5">
                                <span className="label-caps text-muted-foreground">Subject</span>
                                <div className="pt-1 text-sm text-foreground">{copy.subject}</div>
                              </div>
                            )}
                            <div className="rounded-lg border bg-background/50 px-4 py-3">
                              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                                {copy.body}
                              </p>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Generated {formatDate(copy.generatedAt)} · Claude
                              </span>
                              <Button variant="outline" size="sm">
                                <RefreshCw data-icon="inline-start" />
                                Regenerate
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <p className="text-sm text-muted-foreground">
                              No {channelLabels[ch]} copy generated for this lead yet.
                            </p>
                            <Button size="sm">
                              <Wand2 data-icon="inline-start" />
                              Generate {channelLabels[ch]} Copy
                            </Button>
                          </div>
                        )}
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </TabsContent>

              <TabsContent value="timeline" className="pt-4">
                {logs.length > 0 ? (
                  <div className="relative flex flex-col gap-0 pl-2">
                    {logs.map((log, i) => (
                      <div key={log.id} className="relative flex gap-4 pb-6">
                        {i < logs.length - 1 && (
                          <span className="absolute top-7 left-[13px] h-full w-px bg-border" />
                        )}
                        <div className="z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-card">
                          <ChannelIcon channel={log.channel} className="size-3" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-foreground">
                              {channelLabels[log.channel]}
                            </span>
                            <TouchStatusBadge status={log.status} />
                            <span className="ml-auto font-mono text-xs text-muted-foreground">
                              {formatDate(log.at)}
                            </span>
                          </div>
                          <p className="line-clamp-3 pt-1.5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                            {log.copy}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No outreach sent to this lead yet.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
