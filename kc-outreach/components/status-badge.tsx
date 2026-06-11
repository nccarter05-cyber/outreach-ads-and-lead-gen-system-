import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  statusLabels,
  type CampaignStatus,
  type LeadStatus,
  type TouchStatus,
} from "@/lib/data";

const leadStyles: Record<LeadStatus, string> = {
  new: "bg-secondary text-secondary-foreground",
  enriched: "bg-teal-400/10 text-teal-300 border-teal-400/20",
  in_sequence: "bg-gold/10 text-gold border-gold/25",
  contacted: "bg-sky-400/10 text-sky-300 border-sky-400/20",
  replied: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  booked: "bg-gold/20 text-gold-bright border-gold/40",
  not_interested: "bg-destructive/10 text-destructive/90 border-destructive/20",
};

export function LeadStatusBadge({
  status,
  className,
}: {
  status: LeadStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(leadStyles[status], className)}>
      {statusLabels[status]}
    </Badge>
  );
}

const campaignStyles: Record<CampaignStatus, string> = {
  draft: "bg-secondary text-muted-foreground",
  active: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  paused: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  completed: "bg-gold/10 text-gold border-gold/25",
};

export function CampaignStatusBadge({
  status,
  className,
}: {
  status: CampaignStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(campaignStyles[status], className)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

const touchStyles: Record<TouchStatus, string> = {
  scheduled: "bg-secondary text-muted-foreground",
  sent: "bg-sky-400/10 text-sky-300 border-sky-400/20",
  opened: "bg-teal-400/10 text-teal-300 border-teal-400/20",
  replied: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  failed: "bg-destructive/10 text-destructive/90 border-destructive/20",
};

export function TouchStatusBadge({
  status,
  className,
}: {
  status: TouchStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(touchStyles[status], className)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
