# n8n scheduler

The follow-up processor is driven by n8n, not Vercel Cron. (Vercel's Hobby plan
rejects any cron expression finer than daily *at deploy time*, and per-campaign
send windows need hourly ticks — so there is deliberately no `crons` block in a
`vercel.json`.)

## Setup

1. Set `CRON_SECRET` in Vercel → Settings → Environment Variables (any random
   string, 16+ chars). Redeploy so the running functions pick it up.
2. In n8n, create a **Header Auth** credential named `KC Outreach CRON_SECRET`:
   - Name: `Authorization`
   - Value: `Bearer <the same CRON_SECRET value>`
3. Import `outreach-scheduler.workflow.json`, replace
   `REPLACE-WITH-YOUR-DOMAIN` in the HTTP Request node with the deployed
   domain, and activate the workflow.

## Verifying

Hit the endpoint by hand first:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/outreach
```

- `200` with `{"ok":true,"result":{...}}` — working. The result counts what the
  tick did (`sent`, `pendingIntegration`, `skipped`, `completed`, ...); all
  zeros is normal when no campaign is active.
- `401 {"error":"unauthorized"}` — `CRON_SECRET` is unset in Vercel, or the
  header value doesn't match it exactly (it must include the `Bearer ` prefix).

## Inbox poll (Phase 9)

Replies to SMTP-sent cold email land in the sending mailbox, so a second
workflow polls it: import `inbox-poll.workflow.json`, replace the domain, reuse
the same `KC Outreach CRON_SECRET` credential, activate. It calls
`/api/cron/inbox` every 10 minutes (read-only IMAP over `SMTP_USER`/`SMTP_PASS`;
override with `IMAP_HOST`/`IMAP_PORT`). Test it with:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/inbox
```

`200 {"ok":true,"result":{"scanned":N,"stored":M}}` means it works. Instantly
replies don't need this: they arrive via `/api/webhooks/instantly?secret=...`
(set `INSTANTLY_WEBHOOK_SECRET`).

## Notes

- The route is idempotent per tick — a duplicate or missed run is safe; the next
  tick reconciles whatever is still due.
- `maxDuration` on the route is 300s, so the HTTP node's timeout is set to match.
- `neverError` is on so a failing tick shows up in the n8n execution log as a
  non-200 response rather than halting the workflow.
- The same pattern applies to `/api/cron/social` when Phase 8 lands — add a
  second schedule node reusing this credential.
