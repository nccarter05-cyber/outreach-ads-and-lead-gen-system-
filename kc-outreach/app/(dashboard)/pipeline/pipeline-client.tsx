"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { moveDealStage, updateDeal } from "@/app/actions/inbox";
import { dealStageLabels, dealStages, type Deal, type DealStage } from "@/lib/types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function DealCard({ deal }: { deal: Deal }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(deal.value || ""));
  const [nextStep, setNextStep] = useState(deal.nextStep);

  function move(stage: DealStage) {
    let reason: string | undefined;
    if (stage === "lost") reason = window.prompt("Why was this lost?") ?? "";
    startTransition(async () => {
      const res = await moveDealStage(deal.id, stage, reason);
      if (!res.ok) toast.error(res.error ?? "Could not move deal");
    });
  }

  function save(patch: { value?: number; nextStep?: string }) {
    startTransition(async () => {
      const res = await updateDeal(deal.id, patch);
      if (!res.ok) toast.error(res.error ?? "Could not save");
    });
  }

  return (
    <Card className="gap-2 px-4 py-3" aria-busy={pending}>
      <Link href={`/leads/${deal.leadId}`} className="text-sm font-medium hover:text-gold">
        {deal.leadName}
      </Link>
      <div className="-mt-1 text-xs text-muted-foreground">{deal.company}</div>
      <Input
        className="h-8 text-xs"
        inputMode="decimal"
        placeholder="Deal value ($)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const n = Number(value);
          if (Number.isFinite(n) && n !== deal.value) save({ value: n });
        }}
      />
      <Input
        className="h-8 text-xs"
        placeholder="Next step"
        value={nextStep}
        onChange={(e) => setNextStep(e.target.value)}
        onBlur={() => nextStep !== deal.nextStep && save({ nextStep })}
      />
      {deal.lostReason && <div className="text-xs text-muted-foreground">Lost: {deal.lostReason}</div>}
      <Select value={deal.stage} onValueChange={(v) => move(v as DealStage)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dealStages.map((s) => (
            <SelectItem key={s} value={s}>
              {dealStageLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  );
}

export function PipelineClient({ deals }: { deals: Deal[] }) {
  const open = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const openValue = open.reduce((n, d) => n + d.value, 0);
  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Pipeline"
        description={`${open.length} open deals · ${money(openValue)} in play`}
      />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {dealStages.map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          return (
            <div key={stage} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between px-1">
                <span className="label-caps text-gold/80">{dealStageLabels[stage]}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {col.length} · {money(col.reduce((n, d) => n + d.value, 0))}
                </span>
              </div>
              {col.map((d) => (
                <DealCard key={d.id} deal={d} />
              ))}
              {col.length === 0 && (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Empty
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
