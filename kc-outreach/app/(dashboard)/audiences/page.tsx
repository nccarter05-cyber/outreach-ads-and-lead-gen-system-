"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Users, ListOrdered, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { LeadStatusBadge } from "@/components/status-badge";
import { ChannelIcon } from "@/components/channel-icon";
import {
  getLeadsForSegment,
  getSequencesForSegment,
  segments,
} from "@/lib/data";

export default function AudiencesPage() {
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Targeting"
        title="Audience Segments"
        description="Each segment carries its own pain points, channels, and messaging angle."
        actions={
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus data-icon="inline-start" />
                New Segment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="heading-display text-xl">
                  New Audience Segment
                </DialogTitle>
                <DialogDescription>
                  Define who this segment is and what they care about. (Mock —
                  wiring comes later.)
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-2">
                  <Label>Segment name</Label>
                  <Input placeholder="e.g. Multi-Location Restaurants" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Description & pain points</Label>
                  <Textarea
                    placeholder="Who are they, what hurts, and what's the messaging angle…"
                    className="min-h-20"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Criteria (comma-separated)</Label>
                  <Input placeholder="e.g. Has phone, 2+ locations, Slow review responses" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setNewOpen(false)}>Create Segment</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {segments.map((segment) => {
          const segmentLeads = getLeadsForSegment(segment.id);
          const segmentSequences = getSequencesForSegment(segment.id);
          const replied = segmentLeads.filter((l) =>
            ["replied", "booked"].includes(l.status)
          ).length;

          return (
            <Card key={segment.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
                    <Target className="size-4 text-gold" />
                  </div>
                  <div>
                    <h2 className="heading-display text-lg text-foreground">
                      {segment.name}
                    </h2>
                    <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="size-3" />
                        {segmentLeads.length} leads
                      </span>
                      <span className="flex items-center gap-1">
                        <ListOrdered className="size-3" />
                        {segmentSequences.length}{" "}
                        {segmentSequences.length === 1 ? "sequence" : "sequences"}
                      </span>
                      {replied > 0 && (
                        <span className="font-mono text-emerald-300">
                          {replied} engaged
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {segment.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {segment.criteria.map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="border-gold/25 bg-gold/5 font-normal text-gold/90"
                    >
                      {c}
                    </Badge>
                  ))}
                </div>

                {segmentSequences.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="label-caps pb-2 text-muted-foreground">
                        Playbooks
                      </div>
                      {segmentSequences.map((seq) => (
                        <Link
                          key={seq.id}
                          href="/sequences"
                          className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
                        >
                          <span className="text-sm text-foreground group-hover:text-gold">
                            {seq.name}
                          </span>
                          <span className="ml-auto flex items-center gap-1.5">
                            {seq.steps.map((step, i) => (
                              <span key={step.id} className="flex items-center gap-1.5">
                                {i > 0 && <span className="h-px w-2 bg-border" />}
                                <ChannelIcon channel={step.channel} className="size-3" />
                              </span>
                            ))}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                <Separator />
                <div>
                  <div className="label-caps pb-2 text-muted-foreground">Members</div>
                  <div className="flex flex-col gap-1">
                    {segmentLeads.slice(0, 4).map((lead) => (
                      <Link
                        key={lead.id}
                        href={`/leads/${lead.id}`}
                        className="group flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground group-hover:text-gold">
                            {lead.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {lead.company}
                          </span>
                        </span>
                        <LeadStatusBadge status={lead.status} />
                      </Link>
                    ))}
                    {segmentLeads.length > 4 && (
                      <Link
                        href={`/leads?segment=${segment.id}`}
                        className="px-2 pt-1 text-xs text-muted-foreground transition-colors hover:text-gold"
                      >
                        View all {segmentLeads.length} →
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
