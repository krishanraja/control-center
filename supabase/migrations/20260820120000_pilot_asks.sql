-- The daily ask (Focus & Purpose home). APPLIED LIVE 2026-08-20
-- (migration name: pilot_asks). See docs/FOCUS-PURPOSE.md.
--
-- One clean, bounded request per civil day: the number one intervention in the
-- operating manual (docs/focus-purpose/OPERATING-MANUAL.md, section 2). The row
-- exists so the ask survives a reload, so the prediction is on record before
-- the outcome arrives, and so exactly ONE unresolved ask can be surfaced later
-- for its outcome. It is an exposure log, not a journal:
--
--   * One row per ask_date, enforced by the unique index and upserted by the
--     route, mirroring pilot_checkins' one-morning-per-day rule.
--   * The client only ever reads today's row plus the single oldest sent,
--     unresolved row. There is no list endpoint and must never be one, for the
--     same reason worries has no archive: a browsable history of asks and
--     outcomes is something to ruminate through.
--   * Marking an ask sent also writes a ships row (channel 'ask', dedup key
--     'ask:<id>') server-side, so the ledger stays the one place output lands.
--
-- predicted_no_pct is the operator's own forecast of refusal, 0 to 100. The
-- point is calibration against the burden belief (requesters underestimate
-- compliance by as much as half, Flynn and Lake 2008), so it is captured
-- BEFORE the send and never edited after.
create table if not exists public.pilot_asks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ask_date date not null,
  ask_text text not null,
  predicted_no_pct int check (predicted_no_pct between 0 and 100),
  sent_at timestamptz,
  outcome text check (outcome in ('yes', 'no', 'alternative', 'no_reply')),
  resolved_at timestamptz
);

create unique index if not exists pilot_asks_one_per_day on public.pilot_asks (ask_date);
create index if not exists pilot_asks_unresolved_idx on public.pilot_asks (sent_at, resolved_at, ask_date);

alter table public.pilot_asks enable row level security;
drop policy if exists pilot_asks_anon_read on public.pilot_asks;
create policy pilot_asks_anon_read on public.pilot_asks for select to anon using (true);
drop policy if exists pilot_asks_service_all on public.pilot_asks;
create policy pilot_asks_service_all on public.pilot_asks for all to service_role using (true) with check (true);
grant select on public.pilot_asks to anon;
grant all on public.pilot_asks to service_role;
