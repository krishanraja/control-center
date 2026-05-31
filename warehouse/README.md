# Fleet attribution warehouse (OS-owned)

This directory is the **canonical, version-controlled source** for the cross-app
attribution warehouse that all six builder products (Circle, Pulse, CTRL, Gutted,
Merciless, OnAlert) emit into. It lives on the OS Supabase project
`gojpffsrxybbpbdzzrvs`. See `docs/MINDMAKER_OS_ARCHITECTURE.md` section 11.4 for
the full contract.

**Ownership boundary:** the OS repo (this directory) is the *sole migrator* of the
`attribution` schema and the `ingest-attribution` edge function. The six apps NEVER
migrate the warehouse; each holds only the shared `ATTRIBUTION_INGEST_SECRET` and
POSTs to the ingest front door. The function source was originally stood up from the
Merciless rebuild session and is committed here for provenance.

## Contents

- `migrations/0001_attribution_schema.sql` — the `attribution` schema, `events`
  table, `ingest_attribution_event` RPC, and the `funnel_by_campaign` /
  `revenue_by_campaign` read views.
- `migrations/0002_product_truth_app_health.sql` — `public.product_truth` cache,
  `public.attribution_app_health` view, and the public `fleet_*` wrapper views the
  Control Center `/api/fleet-funnel` route reads.
- `functions/ingest-attribution/index.ts` — the secret-gated ingest edge function.
  As of 2026-05-30 it **normalizes both documented envelopes**: the canonical shape
  (`event` / `dedupe_key` / flat `utm_*` / `amount_cents`) and gutted's
  `attribution.events/1` shape (`event_name` / `idempotency_key` / nested `utm{}` /
  `value_cents`). The five canonical apps are unaffected by the normalization (every
  fallback is a no-op for them).

## Deploy

```bash
# Edge function (no Docker needed for deploy):
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy ingest-attribution \
  --project-ref gojpffsrxybbpbdzzrvs --no-verify-jwt

# Migrations: apply via the Supabase Management API SQL endpoint or the SQL editor
# (this repo's GitHub PAT has `repo` scope only, not workflow/db).
```

## Secrets (on the warehouse project)

- `ATTRIBUTION_INGEST_SECRET` — the shared value the six apps send as
  `x-attribution-secret`. Stored in TOOLS.md / `system_config`.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by the Supabase runtime.
