import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  featured = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  featured?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative gap-2 overflow-hidden px-5 py-4",
        featured && "gold-hairline bg-gradient-to-br from-gold/10 to-transparent"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="label-caps text-muted-foreground">{label}</span>
        <Icon className={cn("size-4", featured ? "text-gold" : "text-muted-foreground/60")} />
      </div>
      <div className="font-mono text-3xl tracking-tight text-foreground">
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
