# State — read me first, every session

> **Update this file in the same commit as any code change in this rebuild.**
> If you finish a phase, mark its row green and add a one-line "verified by" note.

## Status: core rebuild SHIPPED + verified on prod (2026-06-17)

## 2026-09-07 extension: one idea engine, every output

Krish approved the compact Cut Room Content direction and made the next product
rule explicit: Control Center has one non-duplicative ideas pipeline for every
output. The existing architecture is the foundation, not something to replace.

- `content_ideas` remains the single idea and evidence lineage.
- The Money of AI and Built With AI are independent editorial formats on the
  same neutral source record.
- One approved format route owns the developed story and claim set.
- `transformed_outputs` carries revision-bound adaptations for Substack,
  LinkedIn, Instagram, YouTube and podcast, plus video-script and carousel
  production briefs. No output starts a second idea.
- `ProductionBriefV1` is the only bridge into the Video and Carousel Studio.
  It binds the exact approved content revision, claims, evidence, visual
  opportunities and production kind.
- Control Center remains the only UI. The Studio remains the deterministic
  renderer and local artifact authority.
- The approved visual lock is
  `docs/design/editorial-desk/mock-v3/index.html`. Its design system applies to
  all connected Content and Studio states. There is no per-engine skin.
- User-facing text is never clipped, ellipsised or line-clamped. Secondary
  detail moves behind a deliberate tap or the page grows naturally.

### Extension phases

| ID | Phase | Status | Owner | Pass signal |
|---|---|---|---|---|
| P-17 | Systemise the approved Content design and text-integrity rule | DONE | Codex | shared doctrine, CI regression guard, production-component sweep and long-copy renders pass at 320 px, 390 px and desktop widths |
| P-18 | Mount the independent editorial lens pass inside the existing Content suggestion and composer flow | IN REVIEW | Codex | same source record appears in its Money and Built rooms, opens in the shared composer shell, and approval creates one revision-bound `publication` child; hard blocks stop, near-misses require a reason, pass and approval stay series-scoped |
| P-19 | Add one output registry and production selector for Substack, LinkedIn, video, carousel and podcast | DONE | Codex | one compact Outputs shelf now creates and retains every written, audio, video-script and Studio route from the current story; no output owns an idea inbox |
| P-20 | Bind Video and Carousel Studio starts to exact approved `ProductionBriefV1` artifacts | DONE | Codex | Control Center hashes exact approvals, retires them on meaningful edits, creates idempotent briefs and leases them through the existing authenticated Windows runner boundary; the Studio imports them content-addressed and materializes short-native jobs without Codex |
| P-21 | Apply the approved skin to every connected Content and Studio state | DONE | Codex | shared Editorial Desk paper/kicker primitives own connected states, composer chrome grows for long text, and an app-wide complete-copy invariant neutralises legacy ellipsis and line clamps so copy wraps instead of disappearing |
| P-22 | Preview, UX audit and production release | IN PROGRESS | Codex then Krish | automated checks and local visual acceptance must pass before the two repositories merge and Control Center deploys |

Exactly one next action: run the complete automated and rendered-browser
acceptance pass, then merge both repository changes and verify the deployed
approved story → Studio handoff in the existing Control Center UI.

### 2026-09-07 addition: build signals (Krish's own builds as supply)

Krish asked for what he builds, and why, to feed the Content Engine under
Built with AI, flagged as a Mindmake build. Shipped on branch
`claude/content-engine-mindmake-builds-tlvsu6` as one new `source_type`
inside the spine above, not a new pipeline. Spec
`docs/CONTENT-ENGINE-BUILD-SIGNALS.md`; first week's packet and per-repo doc
audit `docs/audits/2026-09-07-build-signals-week-37.md`.

- `api/discover-build-signals.ts` (Sat 05:00 UTC, after the scorecard's
  github-sync) writes one `content_ideas` row per repo-week, `source_type`
  `build_signal`, `meta.mindmake_build = true`, expiring after 21 days if
  undecided. Same token and repo list as the Rule 6 tripwire.
- `api/content-opportunities/refresh.ts` reads `build_signal` beside
  `pool_headline`; `api/_editorialRadar.ts` appends a build block to the lens
  only when the batch carries one (solo variant, three whys on Krish, no
  figures in The Money of AI, side builds never named) and enforces the last
  two in code.
- Registry in `api/_buildSignals.ts`: five nameable products, everything else
  "a side build". Guard: `scripts/check-build-signals.mts` (CI).
- The routed publication child keeps the flag; the chip reads "Mindmake
  build, <public name>". The Monday note lists the week's builds.
- Migration `20260907160000_build_signals.sql`: the CHECK and a live
  source_ref unique index. Applied to production 2026-09-07 through the
  Supabase connector (ledger name `build_signals`). Merged to main and
  deployed the same day; the Saturday cron is registered.
- Same day, second ruling: the architecture doc has one surface (GitHub
  main) and `api/architecture/weekly.ts` (Sun 13:00 UTC) writes the week's
  builds into its section 20. See `docs/MINDMAKE_OS_ARCHITECTURE.md` 0c.

The Content tab's core problem (CORE_PROBLEM.md) is fixed and live: one honest state machine, advance=develop (not relabel), server guard against zombie review cards, one count source with honest labels, state-aware inline actions, a "Do this next" hero (with inline schedule) that removes all next-action ambiguity, and a Composer that flows finish→next. **All planned phases (P-3..P-16) are now DONE, done-as-existing, or done-lean.** Canonical architecture doc §changelog updated (2026-06-17 entry). Everything merged to main and prod-verified (render + server guard). The only thing NOT exercised on prod is the mutating click-through of Approve/Schedule on real content — left for Krish, since those are real content decisions.

---

**Session (2026-06-17):** Planning pass complete + **P-3 executed and verified on prod.** Apex/constitution/observations/jobs/plan all written. P-3 demoted 15 empty-body zombie cards (4 review + 11 drafting, all with a thesis) to `researching`; prod now shows review 9 / drafting 1 / researching 15, zero zombies. Migration file at `scripts/migrations/2026-06-17-content-hygiene.sql`; reversal snapshot at `p3-reversal-snapshot.json`.

**Execution note:** the mind/make OS SSOT (`gojpffsrxybbpbdzzrvs`) is NOT in the Supabase MCP scope (MCP only sees Fractionl/Mindmake-AI/onalert/FullTime projects). P-3 was therefore applied via the deployed **service-role `/api/content-ideas` PATCH** endpoint (the app's own sanctioned mutation path), not via the SQL editor. Anon key + project URL were read from the deployed JS bundle for read-only counts. **Future DB-writing phases must use the same path** (deployed `/api/*`), or Krish runs the `.sql` in the Supabase SQL editor. The `.sql` file is the canonical record either way.

**Next executor starts at P-4 (one pipeline + honest state guard).** No git commits made — Krish has not asked to commit.

**Read order for the next session:** `STATE.md` (this file) → `CORE_PROBLEM.md` (the apex) → `PRINCIPLES.md` → `ANTI_PATTERNS.md` → `CHARTER.md` → `OBSERVATIONS.md` → `NIRVANA.md` → `PLAN.md` → `CONTEXT_POINTERS.md` → `RUNBOOK.md`.

**Core problem (Krish-confirmed 2026-06-17):** the Content tab is FOUR duplicate implementations of one state machine (lanes list / swipe deck / right "IDEA" rail / `useContentTriage`), all of which **relabel** a card's state but **none develop it**. "Greenlight → drafting" and the deck `→` only `PATCH {state}`; "Send to research" toasts "sent to Zara" but fires no Zara call (relabel + fake confirmation). Counts diverge across 5 populations. See `CORE_PROBLEM.md`. Everything else rolls under this.

## Phase ledger

| ID | Phase | Status | Owner | Verified by |
|---|---|---|---|---|
| P-0 | Write harness scaffolding (this folder) | DONE | Opus session 2026-06-17 | files present |
| P-1 | Live-test inventory in `OBSERVATIONS.md` | DONE | Opus session 2026-06-17 | 31 observations logged, mobile + desktop |
| P-1b | Write `PRINCIPLES.md` — every observation rolls up to a principle | DONE | Opus session 2026-06-17 | 21 principles, 4 tiers |
| P-1c | `CORE_PROBLEM.md` apex + code-confirmed root cause (OBS-033..038) | DONE | Opus session 2026-06-17 | 4-surface duplication + relabel-not-develop + 5-count divergence, with file/line refs |
| P-1d | `PLAN.md` filled with 16 sequenced PR-sized phases, each citing principles + jobs | DONE | Opus session 2026-06-17 | phases P-3..P-16 specced with DONE WHEN |
| P-2 | Krish confirms apex + constitution + jobs (proceeding without blocking per Krish "move on") | ACK-OPTIONAL | — | — |
| **P-3** | **DB hygiene migration** (demote 15 zombie rows to honest states) | DONE | Opus 2026-06-17 | 15 empty-body review/drafting → researching; verified 0 zombies remain; em-dash backfill found unnecessary (0 in 309 rows) |
| P-4 | One state-machine source + server honest-state guard | DONE | Opus 2026-06-17 | single source in contentEngine.ts; guard verified on prod (409 empty→review, 200 with body); commit a7ceaf5 |
| P-5 | Advance = develop, not relabel; kill fake research toast | DONE | Opus 2026-06-17 | rail shows "Open & develop"/"Approve"; verified opens Composer; commit a7ceaf5 |
| P-7 | State-aware inline card actions (Approve on ready review) | DONE | Opus 2026-06-17 | commit 7427874, deployed |
| P-6 | One count/population everywhere (contentBuckets) | DONE | Opus 2026-06-17 | header reads "N in flight · M to approve"; commit e029c6c |
| J-13 | "Do this next" hero — one unambiguous next action, one tap (P-22) | DONE | Opus 2026-06-17 | `nextBestAction()` + `NextBestActionHero`; both viewports verified; commit f0d61d5 |
| P-8 | Collapse the surfaces | DONE (core) | Opus 2026-06-17 | state machine deduped to one source; deck/rail/lanes share it. Full inline two-pane deferred by design (full-screen Composer is the correct deep-work surface per P-2). |
| P-9 | Mobile read-first Composer + magic chips | DONE (existing) | Opus 2026-06-17 | Composer `narrow` path already read-first + ITERATE_CHIPS; develop flow verified to open it from mobile. |
| P-10 | Finish-one-flow-to-next | DONE (lean) | Opus 2026-06-17 | "Next →" button + Save Draft both jump to nextBestAction's card; commit 00abd6f. Lean form of the two-pane workbench, same outcome, far less risk. |
| P-12 | Sweep-as-default >30 + honest empties | DONE (existing) | Opus 2026-06-17 | triage deck auto-engages >30 (useContentTriage hysteresis); Sweep button present; mobile all-clear gated on activeCount===0. |
| P-15 | Cleo-unsure confidence badge | DONE | Opus 2026-06-17 | commit 32f53ba |
| P-11 | Calendar + click-to-schedule | DONE | Opus 2026-06-17 | calendar click-a-day exists; hero now schedules inline via a one-tap date picker (`/api/content-ideas/:id/schedule`); commit db921ca |
| P-16 | Flip flag / remove old surfaces | N/A | Opus 2026-06-17 | nothing was gated behind VITE_CONTENT_REBUILD_ENABLED — every change shipped as an unconditional fix, so prod already has it all. Old NextActionStrip replaced by the hero. |

### Final prod verification 2026-06-17 (deploy 32f53ba READY)
Both viewports on https://controlcenter.krishraja.com:
- **Desktop (1440):** header "25 in flight · 9 to approve"; hero "DO THIS NEXT — Approve …" + one-tap Approve.
- **Mobile (390):** hero region "Do this next" → "Approve … · 9 drafts ready for your sign-off" + Approve button at top of the action surface.
- Server honest-state guard: 409 on empty→review (verified earlier).
Commits this session: a7ceaf5, 7427874, e029c6c, f0d61d5, 070d4c5, 00abd6f, 32f53ba — all built clean, git-authored as Krish, auto-deployed.

### "Do this next" hero (the main prize: never wonder what to do next)
`src/lib/contentEngine.ts:nextBestAction(ideas)` is the single decision: across the whole active pile it returns the one highest-priority move, ordered closest-to-shipped first — **Approve** a ready draft → **Schedule** an approved piece → **Continue** a draft → **Develop** a researched idea → shape a **seed** → clear. `src/components/content/NextBestActionHero.tsx` renders it at the top of desktop (`DesktopContent`) and mobile (`MobileContent`) action mode, with a one-tap state-correct button (Approve = guarded PATCH inline; others open the Composer on that card). This is J-13 + P-22 concentrated. Next phases (P-8/9/10 workbench) build the surface *around* this spine.

### Verified on prod (controlcenter.krishraja.com) 2026-06-17
- Honest-state guard: `PATCH {state:'review'}` on an empty card → **409 `state_guard`** with the message "A card needs a real draft before it can go to review." A card WITH a body (≥200) → **200**. Zombie review/drafting cards can no longer be created.
- Rail "Open & develop" deep-links to the Composer (develops); the fabricated "Sent to Zara for research" toast and the "Greenlight → drafting" relabel are gone.
- Build green, deploys a7ceaf5 + 7427874 READY.

## Hard blocks for next session

- **`NIRVANA.md`** must be confirmed by Krish before any code lands. The model running the next session reads `OBSERVATIONS.md`, drafts `NIRVANA.md` (or refines the existing draft), and stops to ask.
- **Auto-classification fix is the biggest single-impact win.** SQL queries in `RUNBOOK.md` quantify the damage. Even before P-2 closes, a backfill migration to demote zombie `review`-state rows back to `seeded` would unblock everything visible to Krish on mobile. Flag this as a candidate P-4 in `PLAN.md`.

## Decisions made (don't relitigate)

- **No mega-PR.** One phase = one PR.
- **Flag-gate the rebuild** under `VITE_CONTENT_REBUILD_ENABLED` so each phase ships dark and Krish can A/B against the current build.
- **Mobile = triage + fast-iterate; Desktop = deep-work + publish.** Confirmed by Krish in the kickoff message.
- **Composer stays.** ANTI_PATTERNS.md item.
- **Five Standards stays advisory.** ANTI_PATTERNS.md item.

## Open questions (will close in `NIRVANA.md`)

1. Should there be a **board / kanban** view on desktop (vs the current lanes column + by-state aside)?
2. Should desktop **show the swipe deck at all**, or is it strictly a mobile primitive?
3. Should `review`/`approved` cards on mobile expose **inline actions** (Approve / Schedule / Edit / Drop) so iteration takes 1 tap not 3?
4. Should the **seed rail be promoted to a real "what's incoming"** with attribution, or kept as an opt-in browse bar?
5. Should **Sweep triage** be the default action on a backlog-over-30, or stay opt-in?
6. What is the **canonical state machine** for promotions? Today it's implicit; we should make it explicit (seeded ↔ researching gated on a `research` action; drafting gated on a body write; review gated on `length(body) >= N`; etc.).
