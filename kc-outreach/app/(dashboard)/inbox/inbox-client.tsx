"use client";

import { useMemo, useState, useTransition } from "react";
import { Inbox as InboxIcon, RefreshCw, Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { checkReplies, draftReply, markThreadRead, sendInboxReply } from "@/app/actions/inbox";
import { cn } from "@/lib/utils";
import { dealStageLabels, type InboxThread } from "@/lib/types";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InboxClient({ threads }: { threads: InboxThread[] }) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [openId, setOpenId] = useState<string | null>(threads[0]?.leadId ?? null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () => threads.filter((t) => filter === "all" || t.unread > 0),
    [threads, filter],
  );
  const open = threads.find((t) => t.leadId === openId) ?? null;
  const unreadTotal = threads.reduce((n, t) => n + t.unread, 0);

  function select(t: InboxThread) {
    setOpenId(t.leadId);
    setSubject("");
    setBody("");
    if (t.unread > 0) startTransition(() => void markThreadRead(t.leadId));
  }

  function poll() {
    startTransition(async () => {
      const res = await checkReplies();
      if (!res.ok) toast.error(res.error ?? "Could not check the mailbox");
      else toast.success(`Scanned ${res.scanned}, ${res.stored} new ${res.stored === 1 ? "reply" : "replies"}`);
    });
  }

  function draft() {
    if (!open) return;
    startTransition(async () => {
      const res = await draftReply(open.leadId);
      if (!res.ok) return void toast.error(res.error ?? "Draft failed");
      setSubject(res.subject ?? "");
      setBody(res.body ?? "");
    });
  }

  function send() {
    if (!open || !body.trim()) return;
    startTransition(async () => {
      const res = await sendInboxReply({
        leadId: open.leadId,
        subject: subject || `Re: ${open.messages.at(-1)?.subject ?? ""}`,
        body,
      });
      if (res.pending) toast.warning("Resend isn't configured — reply was not sent");
      else if (!res.ok) toast.error(res.error ?? "Send failed");
      else {
        toast.success("Reply sent");
        setSubject("");
        setBody("");
      }
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Replies"
        title="Inbox"
        description={`${unreadTotal} unread · ${threads.length} conversations`}
        actions={
          <Button variant="outline" size="sm" onClick={poll} disabled={pending}>
            <RefreshCw className={cn("size-4", pending && "animate-spin")} />
            Check replies
          </Button>
        }
      />

      {threads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-20 text-muted-foreground">
          <InboxIcon className="size-6" />
          <p className="text-sm">No replies yet. They appear here when leads answer your outreach.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className="rounded-xl border border-border">
            <div className="flex gap-1 border-b border-border p-2">
              {(["all", "unread"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "secondary" : "ghost"}
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
            <ul className="max-h-[70vh] overflow-y-auto">
              {visible.map((t) => (
                <li key={t.leadId}>
                  <button
                    type="button"
                    onClick={() => select(t)}
                    className={cn(
                      "w-full border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-gold/5",
                      openId === t.leadId && "bg-gold/10",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", t.unread > 0 && "font-semibold text-foreground")}>
                        {t.leadName}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {when(t.lastAt)}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{t.company}</div>
                    <div className="truncate pt-1 text-xs text-muted-foreground/80">
                      {t.messages.at(-1)?.body.slice(0, 90)}
                    </div>
                    <div className="flex gap-1.5 pt-1.5">
                      {t.unread > 0 && <Badge className="bg-gold/20 text-gold">{t.unread} new</Badge>}
                      {t.dealStage && <Badge variant="outline">{dealStageLabels[t.dealStage]}</Badge>}
                      {t.classification === "unsubscribe" && <Badge variant="destructive">Unsubscribed</Badge>}
                    </div>
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing unread.</li>
              )}
            </ul>
          </div>

          {open ? (
            <div className="flex flex-col rounded-xl border border-border">
              <div className="border-b border-border px-5 py-3">
                <div className="heading-display text-lg">{open.leadName}</div>
                <div className="text-xs text-muted-foreground">
                  {open.company} · {open.email}
                </div>
              </div>
              <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto p-5">
                {open.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-lg border px-4 py-3 text-sm",
                      m.direction === "inbound"
                        ? "self-start border-border bg-card"
                        : "self-end border-gold/30 bg-gold/10",
                    )}
                  >
                    <div className="pb-1 font-mono text-[11px] text-muted-foreground">
                      {m.direction === "inbound" ? open.leadName : "You"} · {when(m.occurredAt)}
                    </div>
                    {m.subject && <div className="pb-1 text-xs font-medium">{m.subject}</div>}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 border-t border-border p-4">
                <Input
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <Textarea
                  rows={5}
                  placeholder="Write a reply…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={draft} disabled={pending}>
                    <Sparkles className="size-4" />
                    AI draft
                  </Button>
                  <Button size="sm" onClick={send} disabled={pending || !body.trim()}>
                    <Send className="size-4" />
                    Send reply
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-10 text-sm text-muted-foreground">
              Select a conversation.
            </div>
          )}
        </div>
      )}
    </>
  );
}
