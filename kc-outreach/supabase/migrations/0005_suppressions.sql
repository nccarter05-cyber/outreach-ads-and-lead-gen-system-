-- Suppression list: addresses that must never be emailed again (unsubscribes,
-- bounces). Stored lowercased (check constraint) so it survives a lead being re-scraped or
-- re-created. Written by /unsubscribe and the Instantly webhook; checked by the
-- processor before every send. A trigger also flips any lead that gets a
-- suppressed email (insert or enrichment/manual update) to not_interested.

create table outreach.suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  reason text not null default 'unsubscribed',
  lead_id uuid references outreach.leads(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index suppressions_email_uniq on outreach.suppressions (email);
alter table outreach.suppressions enable row level security;

create or replace function outreach.enforce_suppression()
returns trigger
language plpgsql
set search_path = outreach
as $$
begin
  if new.email is not null
     and exists (select 1 from outreach.suppressions s where lower(s.email) = lower(new.email)) then
    new.status := 'not_interested';
  end if;
  return new;
end;
$$;

create trigger leads_enforce_suppression
  before insert or update of email on outreach.leads
  for each row execute function outreach.enforce_suppression();

-- Backfill: anyone already marked not_interested with an email.
insert into outreach.suppressions (email, reason, lead_id)
select lower(email), 'backfill', id from outreach.leads
where status = 'not_interested' and email is not null
on conflict do nothing;
