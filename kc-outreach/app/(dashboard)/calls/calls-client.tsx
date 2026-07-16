"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Phone,
  Download,
  Wand2,
  Flame,
  Sparkles,
  FileText,
  MessageCircleQuestion,
  Handshake,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { LeadStatusBadge } from "@/components/status-badge";
import { generateCallScriptForLead, generateMissingScripts } from "@/app/actions/copy";
import { statusLabels, type CallScript, type Lead, type Segment } from "@/lib/types";

// Leads who already booked or opted out don't belong on a call list.
const callableStatuses = new Set([
  "new",
  "enriched",
  "in_sequence",
  "contacted",
  "replied",
]);

export function CallsClient({
  leads,
  segments,
  callScripts,
}: {
  leads: Lead[];
  segments: Segment[];
  callScripts: CallScript[];
}) {
  const [segment, setSegment] = useState("all");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scriptByLead = useMemo(
    () => new Map(callScripts.map((s) => [s.leadId, s])),
    [callScripts],
  );
  const segmentName = (id: string | null) =>
    id ? segments.find((s) => s.id === id)?.name ?? "" : "";

  function priorityScore(lead: Lead): number {
    const statusWeight: Record<string, number> = {
      replied: 50,
      contacted: 30,
      in_sequence: 25,
      enriched: 20,
      new: 10,
    };
    let score = statusWeight[lead.status] ?? 0;
    if (lead.enrichment) score += 10 + Math.min(lead.enrichment.signals.length, 4) * 2;
    if (scriptByLead.has(lead.id)) score += 5;
    return score;
  }

  function tier(score: number): { label: string; className: string } {
    if (score >= 45)
      return { label: "Hot", className: "bg-gold/20 text-gold-bright border-gold/40" };
    if (score >= 28)
      return { label: "Warm", className: "bg-gold/10 text-gold border-gold/25" };
    return { label: "Cold", className: "bg-secondary text-muted-foreground" };
  }

  function exportCsv(rows: Lead[]) {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = [
      "Priority",
      "Name",
      "Company",
      "Title",
      "Phone",
      "Segment",
      "Status",
      "Top Signals",
      "Has Script",
    ];
    const lines = rows.map((lead) =>
      [
        tier(priorityScore(lead)).label,
        lead.name,
        lead.company,
        lead.title,
        lead.phone ?? "",
        segmentName(lead.segmentId),
        statusLabels[lead.status],
        lead.enrichment?.signals.slice(0, 3).join("; ") ?? "",
        scriptByLead.has(lead.id) ? "Yes" : "No",
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `call-list-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const callList = useMemo(() => {
    return leads
      .filter(
        (l) =>
          l.phone &&
          callableStatuses.has(l.status) &&
          (segment === "all" || l.segmentId === segment)
      )
      .sort((a, b) => priorityScore(b) - priorityScore(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, segment, scriptByLead]);

  const openLead = openLeadId
    ? callList.find((l) => l.id === openLeadId) ?? leads.find((l) => l.id === openLeadId)
    : null;
  const openScript = openLeadId ? scriptByLead.get(openLeadId) : null;

  function handleGenerateMissing() {
    const missing = callList.filter((l) => !scriptByLead.has(l.id)).length;
    if (missing === 0) {
      toast.info("Every callable lead already has a script");
      return;
    }
    toast.info(`Generating ${missing} script${missing === 1 ? "" : "s"} with Claude…`);
    startTransition(async () => {
      const result = await generateMissingScripts(segment === "all" ? undefined : segment);
      if (result.generated > 0) toast.success(`Generated ${result.generated} call scripts`);
      if (result.failed > 0)
        toast.error(`${result.failed} failed${result.error ? `: ${result.error}` : ""}`);
    });
  }

  function handleGenerateOne(leadId: string) {
    startTransition(async () => {
      const result = await generateCallScriptForLead(leadId);
      if (result.ok) toast.success("Call script generated");
      else toast.error(result.error ?? "Generation failed");
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Cold Calling"
        title="Call List"
        description={`${callList.length} callable leads, ranked by priority. Booked and opted-out leads are excluded.`}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(callList)}>
              <Download data-icon="inline-start" />
              Export CSV
            </Button>
            <Button onClick={handleGenerateMissing} disabled={pending}>
              <Wand2 data-icon="inline-start" />
              {pending ? "Generating…" : "Generate Missing Scripts"}
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3 pb-4">
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Segment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            {segments.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {callList.filter((l) => scriptByLead.has(l.id)).length} scripts ready
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="label-caps pl-4">Priority</TableHead>
              <TableHead className="label-caps">Lead</TableHead>
              <TableHead className="label-caps">Phone</TableHead>
              <TableHead className="label-caps">Segment</TableHead>
              <TableHead className="label-caps">Top Signal</TableHead>
              <TableHead className="label-caps">Status</TableHead>
              <TableHead className="label-caps pr-4 text-right">Script</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {callList.map((lead) => {
              const score = priorityScore(lead);
              const t = tier(score);
              const script = scriptByLead.get(lead.id);
              return (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer"
                  onClick={() => setOpenLeadId(lead.id)}
                >
                  <TableCell className="pl-4">
                    <Badge variant="outline" className={t.className}>
                      {t.label === "Hot" && <Flame className="size-3" />}
                      {t.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-foreground">{lead.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.company} · {lead.title}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-gold/90">{lead.phone}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {segmentName(lead.segmentId)}
                  </TableCell>
                  <TableCell>
                    {lead.enrichment ? (
                      <Badge
                        variant="outline"
                        className="border-gold/25 bg-gold/5 font-normal text-gold/90"
                      >
                        <Sparkles className="size-3" />
                        {lead.enrichment.signals[0]}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Not enriched</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <LeadStatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {script ? (
                      <FileText className="ml-auto size-4 text-gold" aria-label="script ready" />
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {callList.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                  No callable leads in this segment.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Call script sheet */}
      <Sheet open={!!openLeadId} onOpenChange={(open) => !open && setOpenLeadId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {openLead && (
            <>
              <SheetHeader>
                <div className="label-caps text-gold/80">{openLead.company}</div>
                <SheetTitle className="heading-display text-2xl">
                  {openLead.name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <Phone className="size-3.5 text-gold" />
                  <span className="font-mono text-gold/90">{openLead.phone}</span>
                  <span>· {openLead.title}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-5 px-4 pb-6">
                {openLead.enrichment && (
                  <div className="rounded-lg border border-gold/20 bg-gold/5 px-4 py-3">
                    <div className="label-caps pb-1.5 text-gold/80">Context</div>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {openLead.enrichment.summary}
                    </p>
                  </div>
                )}

                {openScript ? (
                  <>
                    <div>
                      <div className="label-caps flex items-center gap-1.5 pb-2 text-muted-foreground">
                        <Phone className="size-3.5 text-gold" />
                        Opener
                      </div>
                      <p className="rounded-lg border bg-background/50 px-4 py-3 text-sm leading-relaxed">
                        {openScript.opener}
                      </p>
                    </div>
                    <div>
                      <div className="label-caps flex items-center gap-1.5 pb-2 text-muted-foreground">
                        <Sparkles className="size-3.5 text-gold" />
                        Value Prop
                      </div>
                      <p className="rounded-lg border bg-background/50 px-4 py-3 text-sm leading-relaxed">
                        {openScript.valueProp}
                      </p>
                    </div>
                    <div>
                      <div className="label-caps flex items-center gap-1.5 pb-2 text-muted-foreground">
                        <MessageCircleQuestion className="size-3.5 text-gold" />
                        Discovery Questions
                      </div>
                      <div className="flex flex-col gap-2">
                        {openScript.questions.map((q, i) => (
                          <div
                            key={q}
                            className="flex gap-3 rounded-lg border bg-background/50 px-4 py-2.5 text-sm leading-relaxed"
                          >
                            <span className="heading-display text-gold">{i + 1}</span>
                            {q}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="label-caps flex items-center gap-1.5 pb-2 text-muted-foreground">
                        <Handshake className="size-3.5 text-gold" />
                        Close
                      </div>
                      <p className="rounded-lg border border-gold/25 bg-gold/5 px-4 py-3 text-sm leading-relaxed">
                        {openScript.close}
                      </p>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Generated{" "}
                        {new Date(openScript.generatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · Claude
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleGenerateOne(openLead.id)}
                      >
                        <Wand2 data-icon="inline-start" />
                        {pending ? "Working…" : "Regenerate"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
                    <p className="max-w-60 text-sm text-muted-foreground">
                      No call script yet. Claude will draft one from this
                      lead&apos;s enrichment signals.
                    </p>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => handleGenerateOne(openLead.id)}
                    >
                      <Wand2 data-icon="inline-start" />
                      {pending ? "Generating…" : "Generate Call Script"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
