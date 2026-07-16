"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  Clock,
  Save,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { ChannelIcon } from "@/components/channel-icon";
import { cn } from "@/lib/utils";
import {
  channelLabels,
  copySourceLabels,
  type Channel,
  type CopySource,
  type Segment,
  type Sequence,
  type SequenceStep,
} from "@/lib/types";
import { deleteSequence, duplicateSequence, saveSequence } from "@/app/actions/sequences";

const channelOptions: Channel[] = ["email", "linkedin", "facebook", "instagram"];
const copySourceOptions: CopySource[] = ["claude", "instantly", "static"];

let tempCounter = 0;

function tempId(prefix: string): string {
  tempCounter += 1;
  return `temp-${prefix}-${tempCounter}`;
}

function isTemp(id: string): boolean {
  return id.startsWith("temp-");
}

function blankStep(order: number): SequenceStep {
  return {
    id: tempId("step"),
    stepOrder: order,
    delayDays: order === 1 ? 0 : 3,
    channel: "email",
    copySource: "claude",
    templatePrompt: "",
    subjectTemplate: "",
    bodyTemplate: "",
  };
}

export function SequencesClient({
  sequences: serverSequences,
  segments,
}: {
  sequences: Sequence[];
  segments: Segment[];
}) {
  const [sequences, setSequences] = useState<Sequence[]>(serverSequences);
  const [selectedId, setSelectedId] = useState<string | undefined>(serverSequences[0]?.id);
  const [pending, startTransition] = useTransition();
  // Reconcile with the server after mutations, but keep an unsaved new sequence alive.
  const skipNextSync = useRef(false);

  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setSequences(serverSequences);
  }, [serverSequences]);

  const selected = sequences.find((s) => s.id === selectedId) ?? sequences[0];

  function updateSelected(patch: Partial<Sequence>) {
    if (!selected) return;
    setSequences((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
  }

  function updateStep(stepId: string, patch: Partial<SequenceStep>) {
    if (!selected) return;
    updateSelected({
      steps: selected.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)),
    });
  }

  function moveStep(index: number, dir: -1 | 1) {
    if (!selected) return;
    const next = [...selected.steps];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateSelected({ steps: next.map((st, i) => ({ ...st, stepOrder: i + 1 })) });
  }

  function removeStep(stepId: string) {
    if (!selected) return;
    updateSelected({
      steps: selected.steps
        .filter((st) => st.id !== stepId)
        .map((st, i) => ({ ...st, stepOrder: i + 1 })),
    });
  }

  function addStep() {
    if (!selected) return;
    updateSelected({ steps: [...selected.steps, blankStep(selected.steps.length + 1)] });
  }

  function addSequence() {
    const seq: Sequence = {
      id: tempId("seq"),
      name: "Untitled Sequence",
      description: "",
      steps: [blankStep(1)],
      createdAt: new Date().toISOString(),
    };
    skipNextSync.current = true;
    setSequences((prev) => [...prev, seq]);
    setSelectedId(seq.id);
  }

  function handleSave() {
    if (!selected) return;
    startTransition(async () => {
      const result = await saveSequence({
        id: isTemp(selected.id) ? undefined : selected.id,
        name: selected.name,
        description: selected.description,
        segmentId: selected.segmentId,
        steps: selected.steps.map((st) => ({
          id: isTemp(st.id) ? undefined : st.id,
          stepOrder: st.stepOrder,
          delayDays: st.delayDays,
          channel: st.channel,
          copySource: st.copySource,
          templatePrompt: st.templatePrompt,
          subjectTemplate: st.subjectTemplate,
          bodyTemplate: st.bodyTemplate,
        })),
      });
      if (result.ok) {
        toast.success("Sequence saved");
        if (result.id) setSelectedId(result.id);
      } else {
        toast.error(result.error ?? "Failed to save sequence");
      }
    });
  }

  function handleDuplicate() {
    if (!selected || isTemp(selected.id)) {
      toast.error("Save the sequence before duplicating");
      return;
    }
    startTransition(async () => {
      const result = await duplicateSequence(selected.id);
      if (result.ok) {
        toast.success("Sequence duplicated");
        if (result.id) setSelectedId(result.id);
      } else {
        toast.error(result.error ?? "Failed to duplicate");
      }
    });
  }

  function handleDelete() {
    if (!selected) return;
    if (isTemp(selected.id)) {
      setSequences((prev) => prev.filter((s) => s.id !== selected.id));
      setSelectedId(sequences[0]?.id);
      return;
    }
    startTransition(async () => {
      const result = await deleteSequence(selected.id);
      if (result.ok) {
        toast.success("Sequence deleted");
        setSelectedId(undefined);
      } else {
        toast.error(result.error ?? "Failed to delete");
      }
    });
  }

  const totalDays = selected?.steps.reduce((n, st) => n + st.delayDays, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Playbooks"
        title="Sequence Builder"
        description="Design multi-step, multi-channel outreach playbooks."
        actions={
          <Button onClick={addSequence}>
            <Plus data-icon="inline-start" />
            New Sequence
          </Button>
        }
      />

      {!selected ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No sequences yet — create one to define your first playbook.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Sequence list */}
          <div className="flex flex-col gap-2">
            {sequences.map((seq) => (
              <button
                key={seq.id}
                type="button"
                onClick={() => setSelectedId(seq.id)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-colors",
                  seq.id === selected.id
                    ? "gold-hairline bg-gold/5"
                    : "bg-card hover:bg-accent/40"
                )}
              >
                <div
                  className={cn(
                    "heading-display text-sm",
                    seq.id === selected.id ? "text-gold" : "text-foreground"
                  )}
                >
                  {seq.name}
                  {isTemp(seq.id) && (
                    <span className="pl-1.5 text-[10px] text-muted-foreground">(unsaved)</span>
                  )}
                </div>
                {seq.segmentId && (
                  <div className="label-caps pt-1 text-muted-foreground/70">
                    {segments.find((s) => s.id === seq.segmentId)?.name}
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-2">
                  {seq.steps.map((step, i) => (
                    <span key={step.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="h-px w-2 bg-border" />}
                      <ChannelIcon channel={step.channel} className="size-3" />
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {seq.steps.length} steps
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Editor */}
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-64 flex-1 flex-col gap-3">
                  <Input
                    value={selected.name}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                    className="heading-display border-transparent bg-transparent px-0 !text-xl shadow-none focus-visible:border-input"
                  />
                  <Input
                    value={selected.description}
                    onChange={(e) => updateSelected({ description: e.target.value })}
                    placeholder="Describe when to use this sequence…"
                    className="border-transparent bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:border-input"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive/70 hover:text-destructive"
                    onClick={handleDelete}
                    disabled={pending}
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={pending}>
                    <Copy data-icon="inline-start" />
                    Duplicate
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={pending}>
                    <Save data-icon="inline-start" />
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Label className="label-caps text-muted-foreground">
                    Target audience
                  </Label>
                  <Select
                    value={selected.segmentId ?? "none"}
                    onValueChange={(v) =>
                      updateSelected({ segmentId: v === "none" ? undefined : v })
                    }
                  >
                    <SelectTrigger size="sm" className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any segment</SelectItem>
                      {segments.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator orientation="vertical" className="!h-3" />
                <span className="font-mono">{selected.steps.length} steps</span>
                <Separator orientation="vertical" className="!h-3" />
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="size-3" />
                  {totalDays} day span
                </span>
              </div>

              {/* Steps */}
              <div className="flex flex-col">
                {selected.steps.map((step, index) => (
                  <div key={step.id} className="relative flex gap-4 pb-4">
                    {/* Rail */}
                    <div className="flex flex-col items-center">
                      <div className="heading-display z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-sm text-gold">
                        {index + 1}
                      </div>
                      {index < selected.steps.length - 1 && (
                        <div className="w-px flex-1 bg-border" />
                      )}
                    </div>

                    {/* Step card */}
                    <div className="flex-1 rounded-xl border bg-background/50 p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <Select
                          value={step.channel}
                          onValueChange={(v) =>
                            updateStep(step.id, { channel: v as Channel })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {channelOptions.map((ch) => (
                              <SelectItem key={ch} value={ch}>
                                <span className="flex items-center gap-2">
                                  <ChannelIcon channel={ch} />
                                  {channelLabels[ch]}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={step.copySource}
                          onValueChange={(v) =>
                            updateStep(step.id, { copySource: v as CopySource })
                          }
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {copySourceOptions.map((cs) => (
                              <SelectItem key={cs} value={cs}>
                                {copySourceLabels[cs]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">
                            {index === 0 ? "Start" : "Wait"}
                          </Label>
                          {index > 0 && (
                            <>
                              <Input
                                type="number"
                                min={0}
                                value={step.delayDays}
                                onChange={(e) =>
                                  updateStep(step.id, {
                                    delayDays: Math.max(0, Number(e.target.value)),
                                  })
                                }
                                className="w-16 font-mono"
                              />
                              <span className="text-xs text-muted-foreground">days</span>
                            </>
                          )}
                          {index === 0 && (
                            <span className="text-xs text-muted-foreground">immediately</span>
                          )}
                        </div>

                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={index === 0}
                            onClick={() => moveStep(index, -1)}
                            aria-label="Move step up"
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={index === selected.steps.length - 1}
                            onClick={() => moveStep(index, 1)}
                            aria-label="Move step down"
                          >
                            <ChevronDown />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive/70 hover:text-destructive"
                            onClick={() => removeStep(step.id)}
                            aria-label="Remove step"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>

                      {step.copySource === "claude" && (
                        <div className="pt-3">
                          <Label className="label-caps pb-1.5 text-muted-foreground">
                            Claude prompt
                          </Label>
                          <Textarea
                            value={step.templatePrompt}
                            onChange={(e) =>
                              updateStep(step.id, { templatePrompt: e.target.value })
                            }
                            placeholder="Describe the message Claude should write for this step…"
                            className="min-h-20 resize-y bg-card/50 text-sm"
                          />
                        </div>
                      )}

                      {step.copySource !== "claude" && (
                        <div className="flex flex-col gap-3 pt-3">
                          {step.channel === "email" && (
                            <div>
                              <Label className="label-caps pb-1.5 text-muted-foreground">
                                Subject template
                              </Label>
                              <Input
                                value={step.subjectTemplate}
                                onChange={(e) =>
                                  updateStep(step.id, { subjectTemplate: e.target.value })
                                }
                                placeholder={
                                  step.copySource === "instantly"
                                    ? "e.g. Quick question, {{firstName}} (Instantly variables)"
                                    : "e.g. Quick question, {{firstName}}"
                                }
                                className="bg-card/50 text-sm"
                              />
                            </div>
                          )}
                          <div>
                            <Label className="label-caps pb-1.5 text-muted-foreground">
                              {step.copySource === "instantly"
                                ? "Body template (Instantly personalizes on send)"
                                : "Body template ({{name}}, {{firstName}}, {{company}}, {{title}}, {{location}})"}
                            </Label>
                            <Textarea
                              value={step.bodyTemplate}
                              onChange={(e) =>
                                updateStep(step.id, { bodyTemplate: e.target.value })
                              }
                              placeholder="Write the message template…"
                              className="min-h-20 resize-y bg-card/50 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  className="ml-12 border-dashed"
                  onClick={addStep}
                >
                  <Plus data-icon="inline-start" />
                  Add Step
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
