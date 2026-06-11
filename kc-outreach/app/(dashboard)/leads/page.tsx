"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Radar, Sparkles, Mail, Phone } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { LeadStatusBadge } from "@/components/status-badge";
import { ChannelIcon } from "@/components/channel-icon";
import {
  getSegment,
  leads,
  segments,
  sourceLabels,
  statusLabels,
  type LeadSource,
  type LeadStatus,
} from "@/lib/data";

function LeadsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [source, setSource] = useState<LeadSource | "all">("all");
  const [segment, setSegment] = useState<string>(
    searchParams.get("segment") ?? "all"
  );
  const [scrapeOpen, setScrapeOpen] = useState(false);

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
  }, [query, status, source, segment]);

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description={`${leads.length} prospects · ${leads.filter((l) => l.enrichment).length} enriched`}
        actions={
          <Dialog open={scrapeOpen} onOpenChange={setScrapeOpen}>
            <DialogTrigger asChild>
              <Button>
                <Radar data-icon="inline-start" />
                Scrape Leads
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="heading-display text-xl">
                  New Lead Scrape
                </DialogTitle>
                <DialogDescription>
                  Runs an Apify actor and imports results into the pipeline.
                  (Wiring comes after the UI — this is a mock.)
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-2">
                  <Label>Source</Label>
                  <Select defaultValue="google_maps">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_maps">
                        Google Maps — local businesses
                      </SelectItem>
                      <SelectItem value="linkedin">
                        LinkedIn — people search
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Search query</Label>
                  <Input placeholder="e.g. roofing contractors" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Location</Label>
                  <Input placeholder="e.g. Columbus, OH" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Assign to segment</Label>
                  <Select defaultValue={segments[0].id}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                <Button variant="outline" onClick={() => setScrapeOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setScrapeOpen(false)}>
                  <Radar data-icon="inline-start" />
                  Run Scrape
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                  <Badge
                    variant="outline"
                    className="border-gold/20 bg-gold/5 text-xs font-normal text-gold/80"
                  >
                    {getSegment(lead.segmentId)?.name}
                  </Badge>
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
                  No leads match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsView />
    </Suspense>
  );
}
