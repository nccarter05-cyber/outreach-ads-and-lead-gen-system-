"use client";

import { useState, useTransition } from "react";
import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/app/actions/auth";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const [error, setError] = useState<string | undefined>(initialError);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setError(undefined);
    startTransition(async () => {
      // On success this action redirects, so nothing returns here.
      const result = await signIn(formData);
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
          <Crown className="size-5 text-gold" />
        </div>
        <div className="text-center leading-tight">
          <div className="heading-display text-lg tracking-[0.08em] text-foreground">
            KING CIRCLE
          </div>
          <div className="label-caps text-gold/80">Outreach AI</div>
        </div>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="mt-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Internal use only. Accounts are created in Supabase — there is no
        self-signup.
      </p>
    </div>
  );
}
