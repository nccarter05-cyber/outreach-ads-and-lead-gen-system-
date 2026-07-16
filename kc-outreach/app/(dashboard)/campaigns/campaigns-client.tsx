"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  Users,
  ListOrdered,
  Pause,
  Play,
  Rocket,
  CalendarClock,
  Gauge,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { CampaignStatusBadge } from "@/components/status-badge";
import { ChannelIcon } from "@/components/channel-icon";
import { createCampaign, setCampaignStatus, type LeadSelection } from "@/app/actions/campaigns";
import { runSchedulerNow } from "@/app/actions/outreach";
import type { Campaign, CampaignSchedule, Lead, Sequence, Weekday } from "@/lib/types";

const allDays: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const timezones = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
];

function tzShort(tz: string): string {
  return timezones.find((t) => t.value === tz)?.label.match(/\((\w+)\)/)?.[1] ?? tz;
}

function formatWindow(schedule: CampaignSchedule): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "pm" : "am";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return m ? `${hr}:${String(m).padStart(2, "0")}${ampm}` : `${hr}${ampm}`;
  };
  return `${fmt(schedule.windowStart)}–${fmt(schedule.windowEnd)}`;
}

function formatDays(days: Weekday[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && !days.includes("Sat") && !days.includes("Sun"))
    return "Mon–Fri";
  return days.join(", ");
}

function DayPicker({
  days,
  onToggle,
}: {
  days: Weekday[];
  onToggle: (day: Weekday) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {allDays.map((day) => {
        const active = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onToggle(day)}
            className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-xs transition-colors ${
              active
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-border bg-transparent text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}

export function CampaignsClient({
  campaigns,
  sequences,
  leads,
}: {
  campaigns: Campaign[];
  sequences: Sequence[];
  leads: Lead[];
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [selection, setSelection] = useState<"all" | "new" | "enriched">("new");
  const [newDays, setNewDays] = useState<Weekday[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [dailyCap, setDailyCap] = useState(25);
  const [timezone, setTimezone] = useState("America/New_York");
  const [pending, startTransition] = useTransition();
  const [running, startRunning] = useTransition();

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const counts = {
    all: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    enriched: leads.filter((l) => l.status === "enriched").length,
  };

  function toggleNewDay(day: Weekday) {
    setNewDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function submit(launch: boolean) {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!sequenceId) {
      toast.error("Pick a sequence");
      return;
    }
    if (newDays.length === 0) {
      toast.error("Pick at least one send day");
      return;
    }
    startTransition(async () => {
      const result = await createCampaign({
        name: name.trim(),
        sequenceId,
        leadSelection: selection as LeadSelection,
        schedule: {
          timezone,
          days: newDays,
          windowStart,
          windowEnd,
          dailyCap,
        },
        launch,
      });
      if (result.ok) {
        toast.success(launch ? "Campaign launched" : "Campaign saved as draft");
        setNewOpen(false);
        setName("");
      } else {
        toast.error(result.error ?? "Failed to create campaign");
      }
    });
  }

  function handleStatus(id: string, status: "active" | "paused") {
    startTransition(async () => {
      const result = await setCampaignStatus(id, status);
      if (result.ok) toast.success(status === "active" ? "Campaign running" : "Campaign paused");
      else toast.error(result.error ?? "Failed to update campaign");
    });
  }

  function handleRunScheduler() {
    startRunning(async () => {
      const result = await runSchedulerNow();
      if (result.ok) {
        const r = result.result;
        toast.success(
          `Scheduler ran: ${r.sent} sent, ${r.pendingIntegration} pending (no Instantly key), ${r.skipped} skipped, ${r.completed} completed`,
          { duration: 8000 },
        );
        if (r.notes.length) toast.info(r.notes.join(" · "), { duration: 8000 });
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Outreach"
        title="Campaigns"
        description={`${campaigns.filter((c) => c.status === "active").length} active · ${campaigns.length} total`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRunScheduler} disabled={running}>
              <Zap data-icon="inline-start" />
              {running ? "Running…" : "Run scheduler"}
            </Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus data-icon="inline-start" />
                  New Campaign
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="heading-display text-xl">
                    New Campaign
                  </DialogTitle>
                  <DialogDescription>
                    Pair a sequence with a lead list and set the send schedule.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <div className="flex flex-col gap-2">
                    <Label>Campaign name</Label>
                    <Input
                      placeholder="e.g. Columbus Home Services — July"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Sequence</Label>
                    <Select value={sequenceId} onValueChange={setSequenceId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick a sequence" />
                      </SelectTrigger>
                      <SelectContent>
                        {sequences.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.steps.length} steps)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Leads</Label>
                    <Select
                      value={selection}
                      onValueChange={(v) => setSelection(v as typeof selection)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All leads ({counts.all})</SelectItem>
                        <SelectItem value="new">New leads only ({counts.new})</SelectItem>
                        <SelectItem value="enriched">
                          Enriched leads only ({counts.enriched})
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />
                  <div className="label-caps text-gold/80">Send Schedule</div>

                  <div className="flex flex-col gap-2">
                    <Label>Send days</Label>
                    <DayPicker days={newDays} onToggle={toggleNewDay} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label>Window start</Label>
                      <Input
                        type="time"
                        value={windowStart}
                        onChange={(e) => setWindowStart(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Window end</Label>
                      <Input
                        type="time"
                        value={windowEnd}
                        onChange={(e) => setWindowEnd(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label>Daily send cap</Label>
                      <Input
                        type="number"
                        min={1}
                        value={dailyCap}
                        onChange={(e) => setDailyCap(Math.max(1, Number(e.target.value)))}
                        className="font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Timezone</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {timezones.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The scheduler sends inside the window, respects the daily cap,
                    and stops automatically when a lead replies.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="outline" onClick={() => submit(false)} disabled={pending}>
                    Save as Draft
                  </Button>
                  <Button onClick={() => submit(true)} disabled={pending}>
                    <Rocket data-icon="inline-start" />
                    {pending ? "Working…" : "Launch"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {campaigns.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No campaigns yet — pair a sequence with a lead list to start outreach.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {campaigns.map((campaign) => {
          const sequence = sequences.find((s) => s.id === campaign.sequenceId);
          const totalTouches = campaign.leadIds.length * (sequence?.steps.length ?? 1);
          const progress = totalTouches
            ? Math.min(100, Math.round((campaign.stats.sent / totalTouches) * 100))
            : 0;
          const openRate = campaign.stats.sent
            ? Math.round((campaign.stats.opened / campaign.stats.sent) * 100)
            : 0;
          const replyRate = campaign.stats.sent
            ? Math.round((campaign.stats.replied / campaign.stats.sent) * 100)
            : 0;

          return (
            <Card
              key={campaign.id}
              className={campaign.status === "active" ? "gold-hairline" : undefined}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <h2 className="heading-display text-lg text-foreground">
                    {campaign.name}
                  </h2>
                  <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ListOrdered className="size-3" />
                      {sequence?.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {campaign.leadIds.length} leads
                    </span>
                  </div>
                </div>
                <CampaignStatusBadge status={campaign.status} />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* Sequence channel trail + send controls */}
                <div className="flex items-center gap-1.5">
                  {sequence?.steps.map((step, i) => (
                    <span key={step.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="h-px w-3 bg-border" />}
                      <span className="flex size-6 items-center justify-center rounded-full bg-secondary">
                        <ChannelIcon channel={step.channel} className="size-3" />
                      </span>
                    </span>
                  ))}
                  <span className="ml-auto flex gap-2">
                    {campaign.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleStatus(campaign.id, "paused")}
                      >
                        <Pause data-icon="inline-start" />
                        Pause
                      </Button>
                    )}
                    {campaign.status === "paused" && (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => handleStatus(campaign.id, "active")}
                      >
                        <Play data-icon="inline-start" />
                        Resume
                      </Button>
                    )}
                    {campaign.status === "draft" && (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => handleStatus(campaign.id, "active")}
                      >
                        <Rocket data-icon="inline-start" />
                        Launch
                      </Button>
                    )}
                  </span>
                </div>

                {/* Schedule line */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 text-gold/70" />
                    {formatDays(campaign.schedule.days)} ·{" "}
                    {formatWindow(campaign.schedule)} {tzShort(campaign.schedule.timezone)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Gauge className="size-3.5 text-gold/70" />
                    <span className="font-mono">{campaign.schedule.dailyCap}/day</span> cap
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between pb-1.5 text-xs">
                    <span className="text-muted-foreground">Sequence progress</span>
                    <span className="font-mono text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Sent", value: String(campaign.stats.sent) },
                    { label: "Open", value: `${openRate}%` },
                    { label: "Reply", value: `${replyRate}%` },
                    { label: "Booked", value: String(campaign.stats.booked), gold: true },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg bg-background/60 py-2">
                      <div
                        className={`font-mono text-lg ${stat.gold ? "text-gold" : "text-foreground"}`}
                      >
                        {stat.value}
                      </div>
                      <div className="label-caps text-muted-foreground/70">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Lead chips */}
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <div className="flex -space-x-2">
                    {campaign.leadIds.slice(0, 5).map((id) => {
                      const lead = leadById.get(id);
                      return (
                        <Link
                          key={id}
                          href={`/leads/${id}`}
                          title={lead?.name}
                          className="flex size-7 items-center justify-center rounded-full border border-border bg-secondary font-mono text-[10px] text-foreground/80 transition-colors hover:z-10 hover:border-gold/50 hover:text-gold"
                        >
                          {lead?.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </Link>
                      );
                    })}
                  </div>
                  {campaign.leadIds.length > 5 && (
                    <span className="text-xs text-muted-foreground">
                      +{campaign.leadIds.length - 5} more
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    Started{" "}
                    {new Date(campaign.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
