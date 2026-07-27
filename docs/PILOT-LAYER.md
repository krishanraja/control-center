# Pilot Layer

The dashboard monitors the agent fleet. This layer monitors the operator.

It exists to counter one specific failure pattern: consuming dashboards as anxiety regulation, expanding scope instead of shipping, and stalling when depleted because choosing a next action is itself the blocker. Every design decision below exists to counter that. They are the product, not implementation details.

## Constraints, non-negotiable

These are written down so a future session does not remove them as improvements.

1. **Output over information.** The pilot layer never adds passive information display beyond the two widgets specified. No charts, no trends, no analytics tabs.
2. **Only external events count as ships.** A ship left the machine toward another human: email sent, post published, payment link created, campaign activated, invoice sent, ask made. Internal work never counts and the UI never implies it does.
3. **No streaks, no guilt UI.** No streak counters, no broken-chain visuals, no red shame states, no "you missed X days" copy. The ledger shows facts: ships this week, days since last ship, and return rate. A gap renders in neutral gray with neutral copy.
4. **Red mode shows exactly one action.** One screen, one pre-chosen 15-minute action, and the means to do it. No navigation, no dashboard, no list of other tasks. One escape hatch link in small text at the bottom.
5. **The morning never asks the operator to choose.** Red mode's action comes from the previous evening's shutdown. Choosing happens the night before, at higher capacity.
6. **Concrete phrasing is enforced.** Any task or tomorrow's ONE must contain an observable action and an external recipient.

The `ShipLedgerCard` in particular contains no branch anywhere that changes colour, weight, or copy based on how the numbers look. A six-day gap renders exactly as calmly as a six-ship week. That is deliberate. Do not add a conditional.

## What v1 is

Four things, all built and live.

**1. State gate.** `src/components/pilot/PilotGate.tsx` wraps the entire app inside `App.tsx`. No morning check-in for today means no dashboard. Three inputs: energy 1 to 5, anxiety 1 to 5, one optional word. Routing is `energy <= 2 || anxiety >= 4` to red, otherwise green, shown with a one-line reason and overridable in one tap either way. The `mode` column stores what was actually chosen, not what was computed. The gate **fails open**: if the pilot routes are unreachable the dashboard renders normally, because a broken check-in service must never lock the operator out of his own control center.

**2. Red mode.** `src/components/pilot/RedMode.tsx`. Renders `tomorrow_one` from the most recent evening check-in as the only visible task. A `tomorrow_one_url` becomes one large primary button, so the doing is embedded and not just the description. Mark done opens the shared ship log form, writes a `ships` row with source `manual`, then unlocks the dashboard. Shipping is the key that opens the rest of the app on a red day. If no evening entry exists, red mode asks exactly one question, applies the same concreteness validation, and locks to the answer. The escape hatch writes `override_at`, which persists for the day so it is taken once rather than once per page load. There is no red in the palette anywhere in red mode.

**3. Evening shutdown.** `src/components/pilot/EveningShutdown.tsx`. Three fields, only tomorrow's ONE required. Auto-prompts after 5pm New York on first interaction, once per day, and never twice. This row is what tomorrow's red mode reads.

**4. Ship ledger.** `api/pilot/ships.ts` plus `src/components/pilot/ShipLedgerCard.tsx`, positioned first on both home surfaces. Ships this week, days since last ship, last three, return rate, and one log button.

## Concreteness rules

`src/lib/pilotConcreteness.ts` holds both word lists as one exported constant block. Editing them is the intended maintenance path.

An entry is rejected if it contains **no** verb from `CONCRETE_VERBS` (send, email, publish, post, call, invoice, price, ask, submit, book, activate, ship, DM, reply) **or** if it contains **any** term from `BANNED_ABSTRACT` (strategy, positioning, think about, figure out, plan for, explore, research, consider, decide who, vision). Rejection shows one hint: "Name the action, the recipient, and what leaves your machine."

Deterministic, no LLM call. The point is not accuracy, it is friction in one direction.

## Data model

`scripts/migrations/2026-07-27-pilot-layer.sql`, applied live 2026-07-27 as `pilot_layer_v1`.

`pilot_checkins` holds both morning and evening rows, distinguished by `kind`. One row per kind per civil day, enforced by the route rather than a constraint, so a reload can never re-gate.

`ships` is the ledger. `dedup_key` is unique, which is what makes webhook ingestion idempotent: n8n retries upsert onto the same row instead of double counting. Manual logs leave it null.

Both tables carry the house RLS posture: enabled, with an anon `SELECT` policy and a `service_role` `ALL` policy. Single operator tool, so no `user_id` and no further RLS complexity.

One column exists beyond the original specification: `pilot_checkins.override_at`, because the red mode escape hatch has to be logged somewhere.

## Routes

`GET /api/pilot/checkin` returns today's morning row, the most recent evening row, and whether tonight's shutdown is done. `POST` writes a morning or evening row, idempotent per civil day. `PATCH` records the red mode override.

`GET /api/pilot/ships` returns the summary: ships this week, days since last ship, last ten, and return rate defined as the **median gap in days between consecutive ships over the trailing 60 days**. Public read, matching every other read route in the repo and the fact that `middleware.ts` already excludes `/api/*` from the edge curtain.

`POST /api/pilot/ships` has two shapes:

- **Webhook**, authenticated. Carries `dedup_key`, `external_ref`, and an `occurred_at` override. Auth uses the `X-Sync-Secret` header, matching `api/sync.ts`, and also accepts `Authorization: Bearer` so n8n can wire either way. Unlike `api/sync.ts`, this route fails **closed** when `SYNC_SECRET` is unset.
- **Manual**, unauthenticated, `{ source: 'manual', channel, description }`. This is the operator tapping "log a ship" in his own browser, which cannot hold `SYNC_SECRET` without shipping it in the bundle. It is narrowed to the fixed channel list and cannot set a dedup key or a timestamp. This matches the posture the repo already takes for every operator-facing write (`api/goals` PATCH, `api/daily-focus/complete`, `api/tasks-inbox/*`), all of which are unauthenticated.

## Divergences from the rest of the repo

Recorded so they are not mistaken for bugs.

**Timezone.** The pilot layer runs on `America/New_York` via `src/lib/pilotDay.ts`. The rest of the app runs on `Europe/London` via `src/lib/londonDate.ts`, which is shared by `useWeeklyFocus`, `useAltitudes`, and `FocusRitual`. This is deliberate and confirmed. The zone is a single exported constant, `PILOT_TZ`, and changing that one line moves both the gate and the shutdown together.

**Streaks.** `useStreaks.ts` and `StreakPills` already existed and are untouched. The no-streaks rule is a rule about the pilot layer, not a retroactive rule about the rest of the dashboard.

## v1.1: the worry compiler, BUILT

Takes a raw mid-day worry and forces it into one of four terminal states so it cannot remain an open loop. It exists because the operator's failure mode is converting worries into research, scope expansion, and reopened decisions. The compiler converts them into tests, 15-minute actions, closed relitigations, or labelled weather instead.

`api/pilot/worries.ts` plus `api/_worry-prompt.ts`, `src/components/pilot/WorryCompiler.tsx`, and `src/components/pilot/DueTestsCard.tsx`. Migration `scripts/migrations/2026-07-27-pilot-worries.sql`, applied live 2026-07-27.

The four states: **test** carries a belief, a falsifiable prediction, a cheap test plan, and a due date, and stays open until an outcome is recorded. **action** is one 15-minute thing that leaves the machine, closed immediately, routed either into the ship log or into tomorrow's ONE. **relitigation** is closed immediately and answered by one question only, what new evidence arrived since the decision was made. **weather** is labelled, given a 7-day expiry, and closed lazily on read.

### Two rules that must not be removed as improvements

**No archive.** There is no endpoint, page, or component that lists past worries. The only rows the client ever sees are tests due today and, on a capped save, the five open tests blocking it. `raw_text` is write-only: it is accepted, stored, and never returned after save, enforced by column-scoped selects in the route rather than by client discipline. An archive of worries is something to ruminate through, which is the exact behaviour this feature exists to interrupt. Do not add a list endpoint.

**Five open tests, hard cap, server-side.** A sixth open test is rejected with HTTP 409 and a body naming the five tests blocking it, so closing one is a single tap away. The cap is enforced in `api/pilot/worries.ts`, not in the UI, so it cannot be routed around.

The compiler runs at `temperature: 0` and reuses the repo's existing OpenAI pattern: a plain fetch with `response_format: json_object`, no SDK. Malformed output retries exactly once and then fails loudly with a 502. Unlike `callSkillLLM` in `api/_skill-prompt.ts`, there is deliberately no stub fallback, because a silently invented compilation is worse than none. The key resolves from the deploy env first and then from `app_secrets`, matching `api/_embeddings.ts`.

The compile button is green mode only, and structurally so: it is mounted inside `PilotGate`'s children, and red mode returns before children ever render. It cannot appear on a red day without someone moving the mount point.

**One known tuning point.** The prompt is included verbatim as specified. In live testing it leans toward the closure states over the test state. "What if the Amperity thing falls through" compiled to `weather` where extracting a falsifiable prediction and a cheap check would have served better, and "the cohort pricing is wrong" compiled to `relitigation` rather than a test of the pricing. Both are defensible readings and neither violates the rules, but if the compiler feels too quick to close, rule 2 is the one to strengthen.

## v2 roadmap

Nothing below is started.

**Three-slot active-work cap.** `NOT STARTED.` At most three things in flight, with an explicit kill ritual required to start a fourth.

**Decision ledger with reopen tax.** `NOT STARTED.` Decisions recorded once, with a deliberate cost to reopening one, so relitigation has friction.

**n8n auto-detection.** `NOT STARTED.` Listeners for Gmail, Substack, and Stripe feeding the existing ingest webhook with dedup keys shaped `gmail:<message_id>` and `substack:<post_id>`. The repo side is already done: the ingest route is idempotent and wiring happens outside it.
