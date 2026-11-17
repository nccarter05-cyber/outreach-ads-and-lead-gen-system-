"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitLandingForm, type LandingFormState } from "@/app/actions/landing";

export function LandingForm({ code, cta }: { code: string; cta: string }) {
  const [state, action, pending] = useActionState<LandingFormState, FormData>(submitLandingForm, {
    status: "idle",
  });

  if (state.status === "ok") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="size-10 text-gold" />
        <h2 className="heading-display text-2xl text-foreground">Thanks — we&apos;ve got it.</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Nate or someone from the King Circle team will get back to you within one business day.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />
      {/* Honeypot — hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lp-name">Name</Label>
          <Input id="lp-name" name="name" required maxLength={200} autoComplete="name" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lp-email">Email</Label>
          <Input id="lp-email" name="email" type="email" required maxLength={254} autoComplete="email" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lp-company">Company</Label>
          <Input id="lp-company" name="company" maxLength={200} autoComplete="organization" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lp-phone">Phone (optional)</Label>
          <Input id="lp-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lp-message">What would you like help with?</Label>
        <Textarea id="lp-message" name="message" rows={4} maxLength={4000} />
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : cta}
      </Button>
      <p className="text-center text-xs text-muted-foreground/70">
        We&apos;ll only use your details to reply to you.
      </p>
    </form>
  );
}
