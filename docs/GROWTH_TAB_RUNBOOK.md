# Growth Tab Runbook — Acquisition Autonomy

The Growth tab (`#/acquisition`) is the command deck for autonomous customer
acquisition. This runbook covers the one manual setup step, the orchestration
levers, and the standing rules.

> **Surface note (2026-09-08).** The tab's sections read insight first: each
> evidence section opens on one sentence with the rows folded, the weekly
> review leads with the council's headline and lets a move become today's
> work or a clip, and Spend limits shows Intel's whole-OS spend beside the
> lane figures with a line saying what each counts. The autonomy rungs are
> said in words on the card. See `docs/PRODUCT.md`, Tab: Growth.

> **Surface note (2026-09-10).** Growth is the last tab through the all-tabs
> rebuild (`docs/plans/all-tabs-rebuild/STATE.md`): it now renders through the
> shared `DoThisNextHero` and its five sections run Review, To do, What's
> moving, then the two references (Where they are, Spend limits), landing on
> To do rather than the map. The creative board writes real scripts now
> (`/api/growth/clip-ideas`, `/api/growth/clip-script`), two calls in series:
> build the argument, then cut it to length and shot notes, with an optional
> humour register from `api/_humor.ts`. Neither route has taken a live call
> yet. See `docs/PRODUCT.md`, Tab: Growth.

> **Surface note (2026-09-11).** The "Do this next" hero now acts even when
> its own section is already open, pointing at the first review still owing
> a ruling instead of no-opping. On a phone the purpose sentence and the
> section-purpose line are gone, since the hero already says what to do and
> the two lines were costing more than half the screen before any content;
> the desk keeps both. See `docs/PRODUCT.md`, Tab: Growth.

## Standing rules (locked 2026-07-16)

1. **No personal brand in public — ever.** Every outbound surface is
   product-branded: sends go out as the product mailbox (per
   `venture_registry.voice_profile.sender/mailbox`), reply and win-back drafts
   are written in the product's voice and sign off as the product team. All
   personal-posting playbook tactics (personal LinkedIn/Reddit/Show-HN) are
   excluded from the autonomous system.
2. **Profitable from day 1 is mechanical, not aspirational.** A lane cannot be
   promoted up the autonomy ladder while its contribution margin is ≤ $0 —
   not even with force. Paid budget requires attributed revenue first
   (Gate 4) and all lanes' paid budgets are capped at $500/mo total.
3. **Stripe stays ground truth.** The Growth tab never writes customer state.

## One-time setup: import the 3 new n8n workflows (~5 min)

The workflow definitions are checked in (sanitized). In n8n → Workflows →
Import from file:

| File (scripts/n8n/) | What it does | After import |
|---|---|---|
| `acquisition-send-dispatcher.workflow.json` | Approved sends → Resend → ledger `sent`; 15-min sweep fallback; per-lane product sender identity; suppression honored | Fill the `Authorization` header on **Send via Resend** (Resend key) and the Supabase `apikey`/`Authorization` headers (service-role key) — same inline-header idiom as the live CTRL workflows. Activate. |
| `acquisition-reply-intake.workflow.json` | Inbound reply → classify (Haiku) → `acquisition_replies` → **suppress the lead's pending sends** → positive intent flips lead to `conversation` | Fill Anthropic `x-api-key` + Supabase headers. Activate. Then point Resend inbound routing (ctrl@ / pulse@ …) at `/webhook/acquisition-reply-inbound`. |
| `zara-geo-citation-sweep.workflow.json` | Weekly probe: is each product cited in AI answers? → `zara_signals` (`geo-citation`) → Growth tab panel | Fill Perplexity `Authorization` + Supabase headers. Activate. ~$1/mo. |

Then add the dispatcher's workflow ID to the breaker map so a budget trip can
pause it (`system_config.acquisition_lane_workflows`):

```json
{ "mm_ctrl": ["TaSvbCwSnpYzNTAd", "<dispatcher-workflow-id>"] }
```

**Never add the Unsubscribe workflow (`HxrGpBEtAeKIQU8S`) to that map** —
suppression must stay live even when a lane is paused.

Finally, apply `scripts/n8n/ctrl-nurture-scheduler-patch.md` to the live
Nurture Scheduler: autonomy-aware `sample_required`, stop creating `send-{id}`
tasks, skip queueing when the lane is paused.

## Orchestration map — where every lever lives

| You want to… | Where |
|---|---|
| Approve/reject queued sends (single or batch) | Growth tab → Send Approvals deck, or the `send_sample` card in the Home decisions inbox |
| Rule on a proposed sequence — **and rewrite its copy first** | `sequence_approval` card → "Open in Growth" → Sequence Review sheet (edit any touch, Save & approve). Amendments are audited. |
| Change a lane's voice / ICP / strategy / never-say list | Growth tab → Lane playbook → Amend (writes `venture_registry.voice_profile`; every agent-written touch conforms immediately) |
| Raise/lower autonomy | Autonomy ladder card. Demote is always one tap. Promote runs the mechanical gates and shows the exact unmet-criteria checklist; force overrides volume gates only — never the profit gate. |
| Set budgets / pause / resume a lane | Profit Governor card. 80% burn → warning task; 100% → breaker pauses the lane's workflows automatically; resume is yours only. |
| Add/remove an acquisition lane | `system_config.acquisition_lanes` (JSON array of venture slugs) |
| Re-map which workflows the breaker may pause | `system_config.acquisition_lane_workflows` |
| See what content converts | Content → capture panel (needs `utm_campaign` on published pieces per ATTR-001; capture intake stamps `leads.attribution_content_idea_id`) |
| Handle a reply | Reply inbox → "Draft product reply" (product voice, product mailbox) or Close. Replies always halt the sequence automatically. |
| Win back churned subscribers | Churn re-engagement queue → Draft win-back |

## Test-and-learn loop (per lane)

frames → sends ledger → `frame_conversion` view → weekly `Maya | Frame A/B
Sweep` (spec: `scripts/n8n/maya-frame-ab-sweep.md`; deterministic winner at
n≥30/arm with 25% relative lift; LLM writes rationale only) →
`frame_promotion` proposal → your ruling → scheduler adopts the winner.
Rejection rates feed Vera's weekly ladder check via `feedback_queue`.

## Outstanding (deliberate)

- ~~**Stripe price map** covers only CTRL~~ **Done, and it was wrong rather than
  thin (2026-10-05).** Every lane is mapped. More importantly, the three plans
  the map filed under CTRL are the Substack's: read live from Stripe, all three
  carry `metadata.substack = "yes"`, so Control Center had been reporting the
  publication's founding members as CTRL revenue ("CTRL: $13.51/mo, 2 paying"
  against a product with no paying customers at all). Migration
  `20261005140000_substack_revenue_is_not_ctrl.sql` moved them to `publication`
  and kept the old row under
  `stripe_price_product_map_backup_20261005`. CTRL's one real line, Edge Pro at
  $49 a month, stays mapped to `mm_ctrl`.
- ~~**Stripe webhook signing secrets** are unarmed~~ **Partly resolved, and the
  shape of it was worse than "unarmed" (2026-10-05).** Measured rather than
  assumed:
  - Every LIVE PRODUCT endpoint already verifies and fails closed. A forged
    `invoice.payment_succeeded` with no signature was POSTed to all five on
    2026-10-05 and every one refused it: CTRL `400 missing_signature`, Full Time
    `400 Missing signature`, Legibility `400 bad signature`, Circle
    `400 Missing signature`, Pulse `400 invalid signature`.
  - The unverified path was the OS-side n8n intake (`Stripe | Revenue Intake`,
    three webhooks, no credential on any of them). Its check read
    `if (secret && raw) { ...verify... }`, so with the secret store empty it
    SKIPPED verification and fell through to the `customers` upsert. The only
    reasons it was never exploitable are that all three code nodes are disabled
    and their database headers were blanked on 2026-10-03, and neither of those
    is a security control.
  - `scripts/n8n/stripe-revenue-intake.workflow.json` now fails closed: no
    secret, no crypto, an unreachable secret store or a stale timestamp each
    REFUSE, and the signature compare is constant time. **Not yet pushed to n8n
    cloud**, so the cloud copy still holds the fall-through behind its disabled
    nodes.
  - `POST /api/revenue/webhook?account=<key>` is the verified replacement
    (`api/_stripeWebhook.ts`, 13 tests in `tests/api/stripeWebhook.test.ts`
    including a mutation test that fails the moment the fall-through returns).
  - Still open: the four n8n webhook paths answer `200 "Workflow was started"`
    to any unauthenticated POST. Nothing is written (23 `customers` rows before
    and after the probe), but each call is a billable execution. Deactivating
    the workflow is Krish's call.
- Legibility / Full Time / Pulse capture intakes: clone the CTRL pattern
  (checked-in reference: `acquisition-ctrl-capture-intake.workflow.json`) with
  their lane slug; the whole Growth tab lights up per lane automatically.

## The AEO research machine (2026-09-09)

`krishanraja/AEO-Engine` runs on GitHub Actions every Sunday 04:00 UTC and
lands one packet per subject per week on `POST /api/aeo/ingest`. Full spec:
`docs/AEO-ENGINE.md`; contract: `docs/AEO-PACKET.schema.json`.

- **Subjects** live in `growth_aeo_subjects` and are edited on the tab or
  through `api/aeo/subjects`. A prospect can link a Room target so the
  week's read can be used in the approach. Competitor lists start empty on
  purpose: name them, the engine will not invent them.
- **Run now** (`POST /api/aeo/run`) queues an `aeo_commands` row and fires
  `repository_dispatch` on `AEO_REPO`. The response says `dispatched: true`
  or the GitHub error. There is no drain: a row that could not start stays
  queued until the next scheduled packet supersedes it.
- **Secrets, by name.** Vercel: `AEO_ENGINE_SECRET` (the bearer the engine
  proves), `AEO_DISPATCH_TOKEN` (fine-grained, scoped to the engine repo,
  Contents read and write, which repository_dispatch needs), `AEO_REPO`.
  The engine repo's Actions secrets: `CONTROL_CENTER_URL`,
  `AEO_ENGINE_SECRET`, `FIREFLIES_API_KEY`, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, optional `XAI_API_KEY` and
  `EXA_API_KEY`; the variable `AEO_MAX_USD_PER_RUN` caps a run.
- **When it goes quiet** the Content tab's obligation strip says so
  (`aeo_ingest` in `content_engine_runs`, a week plus a day of grace), and
  the Sunday council reads the missing digest as an unknown.
- **Retirement, owed.** The Monday `api/growth/geo-probe` Perplexity cron
  stays in `vercel.json` until the engine has two green Sundays; then remove
  the cron entry and keep the route as a manual fallback.
- **Legibility** is not a subject yet (the Growth key space does not carry
  it), so its striking-distance rows are never read. "No gap" for Legibility
  is not a finding.

## Site visits (2026-09-27)

Growth > What's moving carries a third read between the GEO probes and the SEO
sweep: one card per site Google Analytics reads (mindmake.co,
home.makeyourmindup.ai, fulltime.fm, legibility.io). The registry is
`src/lib/webProperties.ts`; adding a site is one entry there. The panel is
`src/components/growth/WebPropertiesPanel.tsx`, reading
`GET /api/growth/web-insights` through `src/hooks/useWebInsights.ts`. Full
measurement rules: `docs/MEASUREMENT_SPINE.md`, "Google Analytics, four sites".

- **Verdicts before numbers.** Each card opens on a health chip: Not
  connected, Cannot check, Wrong property, Tag missing, Nothing received,
  First days, Measuring (quiet week) or Measuring. Visit counts and the
  sparkline show only when the read succeeded (`ok`, `quiet`, `provisional`).
  An unmeasured site shows why, never a zero. Flags under the chip say what
  the count leaves out: consent-gated, thresholded, Admin API off,
  undercounting against PostHog, host filter off, last read failed.
- **The ladder: one action per site.** Rung 1 is read access (a grant or a
  missing id), rung 2 is wiring (wrong stream, tag missing, nothing
  received, the Admin API), rung 3 is data (the Plausible key for
  mindmake.co), rung 4 is a ruling Krish owes (whether legibility.io is
  live; what fulltime.fm is for was ruled on 2026-10-06: ready for pilot
  users), rung 5 is a growth action chosen by the
  model or a fixed fallback, retired after 14 days unacted. The lowest open
  rung wins. Every action says why, the first step, which job it serves,
  how many minutes, and what closes it; the check closes it on its own when
  the detector sees it done. "Put on today" writes the title and job to
  today's 3 through `/api/daily-focus/slot`.
- **The shared action.** When two or more sites are refused for the same
  reason (an account-level grant, or the Admin API), one step shows once at
  the top of the panel and the cards it blocks read "Waiting on the step at
  the top." Rungs 1 and 2 also take the Growth hero, first, because every
  other number on the tab is blind to a site that is not being counted. The
  hero's "Show me" scrolls to the step and rings it. Rulings and growth
  actions stay on the cards.
- **Check now.** Runs the whole check on demand (`POST` with
  `{ action: 'refresh' }`, about a minute). Once every ten minutes; inside
  the window the button still answers, with a toast saying when to try
  again. The daily run is the Vercel cron at 13:20 UTC.
- **Provisional.** For 48 hours after a tag goes live the card reads First
  days and the numbers are marked as settling. fulltime.fm and legibility.io
  were tagged on 2026-09-27, so they read provisional until about 09:57 UTC
  on 2026-09-29.
- **Measure only.** A site Krish rules "measure" keeps its visit read and gets
  no actions: the card says "Measure only, by your ruling." A retired site
  reads "Retired by your ruling. Only visits are read."
- **Before the migration is applied** the panel says the table is not in the
  database yet. That is the honest state, not a bug.
