"use client";

import { useState, useTransition } from "react";
import { Sparkles, Wand2, Megaphone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { enrichLeads, updateLeadStatus } from "@/app/actions/leads";
import { generateChannelCopy } from "@/app/actions/copy";
import { addLeadToCampaign } from "@/app/actions/campaigns";
import {
  channelLabels,
  statusLabels,
  type Channel,
  type LeadStatus,
} from "@/lib/types";

export function EnrichButton({
  leadId,
  enriched,
  variant = "outline",
  size = "default",
}: {
  leadId: string;
  enriched: boolean;
  variant?: "outline" | "default";
  size?: "default" | "sm";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await enrichLeads([leadId]);
          if (result.enriched > 0) toast.success("Lead enriched");
          else toast.error(result.error ?? "Enrichment failed");
        })
      }
    >
      <Sparkles data-icon="inline-start" />
      {pending ? "Enriching…" : enriched ? "Re-enrich" : "Enrich"}
    </Button>
  );
}

export function GenerateAllCopyButton({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const channels: Channel[] = ["email", "linkedin", "facebook", "instagram"];
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          let generated = 0;
          for (const ch of channels) {
            const result = await generateChannelCopy(leadId, ch);
            if (result.ok) generated += 1;
            else toast.error(`${channelLabels[ch]}: ${result.error}`);
          }
          if (generated > 0) toast.success(`Generated copy for ${generated} channels`);
        })
      }
    >
      <Wand2 data-icon="inline-start" />
      {pending ? "Generating…" : "Generate Copy"}
    </Button>
  );
}

export function GenerateChannelCopyButton({
  leadId,
  channel,
  regenerate = false,
}: {
  leadId: string;
  channel: Channel;
  regenerate?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={regenerate ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generateChannelCopy(leadId, channel);
          if (result.ok) toast.success(`${channelLabels[channel]} copy generated`);
          else toast.error(result.error ?? "Generation failed");
        })
      }
    >
      {regenerate ? <RefreshCw data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
      {pending
        ? "Generating…"
        : regenerate
          ? "Regenerate"
          : `Generate ${channelLabels[channel]} Copy`}
    </Button>
  );
}

export function AddToCampaignDialog({
  leadId,
  campaigns,
}: {
  leadId: string;
  campaigns: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Megaphone data-icon="inline-start" />
          Add to Campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="heading-display text-xl">Add to Campaign</DialogTitle>
          <DialogDescription>
            The lead enters the campaign at step 1 on the next scheduler run.
          </DialogDescription>
        </DialogHeader>
        {campaigns.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No campaigns exist yet — create one on the Campaigns page.
          </p>
        ) : (
          <div className="py-2">
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !campaignId}
            onClick={() =>
              startTransition(async () => {
                const result = await addLeadToCampaign(campaignId, leadId);
                if (result.ok) {
                  toast.success("Lead added to campaign");
                  setOpen(false);
                } else {
                  toast.error(result.error ?? "Failed to add");
                }
              })
            }
          >
            {pending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadStatusSelect({
  leadId,
  status,
}: {
  leadId: string;
  status: LeadStatus;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(v) =>
        startTransition(async () => {
          const result = await updateLeadStatus(leadId, v as LeadStatus);
          if (result.ok) toast.success(`Status set to ${statusLabels[v as LeadStatus]}`);
          else toast.error(result.error ?? "Failed to update status");
        })
      }
    >
      <SelectTrigger size="sm" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(statusLabels) as LeadStatus[]).map((s) => (
          <SelectItem key={s} value={s}>
            {statusLabels[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
