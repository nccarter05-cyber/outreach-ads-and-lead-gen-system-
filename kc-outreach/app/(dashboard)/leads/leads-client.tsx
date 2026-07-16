"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Radar, Sparkles, Mail, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { LeadStatusBadge } from "@/components/status-badge";
import { ChannelIcon } from "@/components/channel-icon";
import { createLead, enrichLeads } from "@/app/actions/leads";
import {
  sourceLabels,
  statusLabels,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type Segment,
} from "@/lib/types";

export function LeadsClient({ leads, segments }: { leads: Lead[]; segments: Segment[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [source, setSource] = useState<LeadSource | "all">("all");
  const [segment, setSegment] = useState<string>(searchParams.get("segment") ?? "all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    company: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    segmentId: "",
  });
  const [pending, startTransition] = useTransition();
  const [enriching, startEnriching] = useTransition();

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter((lead) => {
      if (status !== "all" && lead.status !== status) return false;
      if (source !== "all" && lead.source !== source) return false;
      if (segment !== "all" && lead.segmentId !== segment) return false;
      if (
        q &&
        ![lead.name, lead.company, lead.title, lead.location]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [leads, query, status, source, segment]);

  const unenriched = filtered.filter((l) => !l.enrichment);

  const handleAdd = () => {
    if (!form.name.trim() || !form.company.trim()) {
      toast.error("Name and company are required");
      return;
    }
    startTransition(async () => {
      const result = await createLead({
        name: form.name.trim(),
        company: form.company.trim(),
        title: form.title.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        location: form.location.trim(),
        segmentId: form.segmentId || undefined,
      });
      if (result.ok) {
        toast.success(`Lead "${form.name.trim()}" added`);
        setAddOpen(false);
        setForm({ name: "", company: "", title: "", email: "", phone: "", location: "", segmentId: "" });
      } else {
        toast.error(result.error ?? "Failed to add lead");
      }
    });
  };

  const handleEnrich = () => {
    if (unenriched.length === 0) return;
    const ids = unenriched.map((l) => l.id);
    toast.info(`Enriching ${ids.length} lead${ids.length === 1 ? "" : "s"} via Exa…`);
    startEnriching(async () => {
      const result = await enrichLeads(ids);
      if (result.enriched > 0) {
        toast.success(`Enriched ${result.enriched} lead${result.enriched === 1 ? "" : "s"}`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} enrichment${result.failed === 1 ? "" : "s"} failed${result.error ? `: ${result.error}` : ""}`);
      }
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description={`${leads.length} prospects · ${leads.filter((l) => l.enrichment).length} enriched`}
        actions={
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" disabled>
                      <Radar data-icon="inline-start" />
                      Scrape Leads
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Lead sourcing runs through the n8n front-door workflow — leads land here automatically.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus data-icon="inline-start" />
                  Add Lead
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="heading-display text-xl">Add Lead</DialogTitle>
                  <DialogDescription>
                    Manually add a prospect to the pipeline.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Company *</Label>
                    <Input
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      placeholder="Acme Roofing"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Title</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Owner"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Location</Label>
                    <Input
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Columbus, OH"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="jane@acme.com"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="(614) 555-0100"
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label>Segment</Label>
                    <Select
                      value={form.segmentId || "none"}
                      onValueChange={(v) => setForm({ ...form, segmentId: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No segment</SelectItem>
                        {segments.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdd} disabled={pending}>
                    {pending ? "Adding…" : "Add Lead"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <div className="relative w-64">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, location…"
            className="pl-8"
          />
        </div>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="w-48">
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
        <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(statusLabels) as LeadStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setSource(v as LeadSource | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {(Object.keys(sourceLabels) as LeadSource[]).map((s) => (
              <SelectItem key={s} value={s}>
                {sourceLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={handleEnrich}
          disabled={enriching || unenriched.length === 0}
        >
          <Sparkles data-icon="inline-start" />
          {enriching ? "Enriching…" : `Enrich ${unenriched.length || ""}`}
        </Button>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {filtered.length} / {leads.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="label-caps pl-4">Lead</TableHead>
              <TableHead className="label-caps">Title</TableHead>
              <TableHead className="label-caps">Segment</TableHead>
              <TableHead className="label-caps">Contact</TableHead>
              <TableHead className="label-caps">Source</TableHead>
              <TableHead className="label-caps">Status</TableHead>
              <TableHead className="label-caps pr-4 text-right">Enriched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((lead) => (
              <TableRow
                key={lead.id}
                className="cursor-pointer"
                onClick={() => router.push(`/leads/${lead.id}`)}
              >
                <TableCell className="pl-4">
                  <div className="text-sm text-foreground">{lead.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {lead.company} · {lead.location}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.title}
                </TableCell>
                <TableCell>
                  {lead.segmentId && (
                    <Badge
                      variant="outline"
                      className="border-gold/20 bg-gold/5 text-xs font-normal text-gold/80"
                    >
                      {segments.find((s) => s.id === lead.segmentId)?.name}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {lead.email && <Mail className="size-3.5 text-gold/80" aria-label="email" />}
                    {lead.phone && (
                      <Phone className="size-3.5 text-muted-foreground" aria-label="phone" />
                    )}
                    {lead.linkedinUrl && <ChannelIcon channel="linkedin" className="size-3.5" />}
                    {lead.facebookUrl && <ChannelIcon channel="facebook" className="size-3.5" />}
                    {lead.instagramUrl && <ChannelIcon channel="instagram" className="size-3.5" />}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {sourceLabels[lead.source]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <LeadStatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {lead.enrichment ? (
                    <Sparkles className="ml-auto size-4 text-gold" aria-label="enriched" />
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                  {leads.length === 0
                    ? "No leads yet — add one manually or wait for the sourcing workflow."
                    : "No leads match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
