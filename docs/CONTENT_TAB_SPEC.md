# Content Tab Upgrade — Lanes Spec

**Status:** SHIPPED · 2026-06-02 · all phases live on `main`
**Author:** Claude (Opus 4.8) on behalf of Krish

> **Build status (2026-06-02):** All phases shipped & deployed.
> - Phase 1 (schema + backfill + `content_cadence` + `recompute_content_cadence()`) — live; migrations `scripts/migrations/2026-06-02-*.sql`.
> - Phase 2 (lane toggle + CadenceBar, desktop + mobile) — PR #114, merged.
> - Phase 3 (industrialized Transform, §5.5) — PR #115: `/api/content-ideas/:id/transform`, parent→child rows, per-lane krish-voice contracts in `system_config.content_lane_*`.
> - Phase 4 (per-lane Perplexity sourcing) — `Cleo | Content Lane Sourcing` n8n (`rRAyEUs7NsY06hFy`), active daily; all 4 lanes seeded with real drafts.
> - §4.3a (research panel + dive-deeper) — PR #115: `/api/content-ideas/:id/dive-deeper` (scoped Perplexity) + `ResearchAndTransform` in the expanded card.
> Publish stays manual per lane (S&N→Wix, BE→IG); nothing auto-publishes.

> **Update (2026-06-11) — the inline card became a full-screen Composer.** The lane model below still holds (lanes, cadence, pillars, Transform engine), but the *production surface* changed. The inline `ContentIdeaCardActionable` that stacked the draft + `ResearchAndTransform` + the content engine into one scrolling column was replaced by a full-screen **Composer** (`src/components/content/ContentComposer.tsx`), opened by deep-linking `#/content?idea=<id>`. One piece per screen: draft canvas + a single-panel rail (**Cleo chat · Refine · Materials · Research · Standards**), one end CTA **Save Draft** (→ Google Doc in Drive + Telegram alert). New: a **Materials** store (`meta.materials[]`) so the research corpus is kept and grounds generation + the saved Doc; a **Cleo chat** writing partner; **Refine → Adapt to lane** replacing the duplicate "Transform into other lanes"; `sanitizeVoice()` stripping em dashes everywhere. **Mobile is review-first**: a "Ready for you" deck (only `review` / `approved` / urgent) → a read-mode composer with one-tap magic adjustments + sticky Save Draft. Also fixed a latent RLS bug (draft `body` was saved via the anon client, which RLS blocks → edits silently lost; now via the API). PRs #132 + #134. Full detail in `MINDMAKER_OS_ARCHITECTURE.md` §5.7.

> **Update (2026-06-11) — triage deck + no-scroll app shell (PRs #136, #137).** The pipeline view broke at scale: auto-seed floods upstream states and nothing was promoted (~218 active = 86 seeded + 107 researching + 25 drafting, 0 review/0 approved), so desktop mounted every card unbounded and crashed the browser, and the mobile "Ready for you" deck — filtering to only `review`/`approved`/urgent, all zero — showed a false "You're clear" over the hidden backlog. The Content tab is now **mode-switched by active count** (hysteresis: enter > 30, exit ≤ 25): a one-card-at-a-time **triage deck** (`TriageDeck`/`TriageCard` via `useContentTriage` + `useCardDeck`) when > 30 — **left = Drop** (undoable), **right = Advance one stage** (`seeded→researching→drafting→review`; `review`/`approved` open the Composer, the two human gates), **tap/↑ = open**; pointer swipe + buttons + arrow keys, only ~3 cards mounted. At ≤ 30 it returns to the action view (desktop lanes now bounded by `LANE_CAP` with overflow → triage; mobile shows **Ready for you** + a **Drafts** tier + an **upstream count**, all-clear gated on `activeCount === 0`). Separately, the whole control center became a **no-scroll app frame** (`AppFrame`; root `h-[100dvh] overflow-hidden`, chrome fixed, each tab scrolls in a contained region) — verified across all 13 tabs × desktop+mobile. Full detail in `MINDMAKER_OS_ARCHITECTURE.md` §5 + §5.7.

> **Update (2026-08-06): Techonomic retired, folded into MYMU as the "MYMU: Teardown" format.** (The channel was called Mindmaker LIVE for part of that day before being renamed to MYMU / slug `makeyourmindup`.) Lane 3 below is gone. Krish's ruling: fewer brands, and the investigative depth engine is the public version of the advisory offer, so the proof belongs where the offer lives. `techonomic.co` never had a production deployment. What survives is the **format**, not the channel: the "Full essay" transform axis and the `investigation` venture rubric in `api/_finalPass.ts` (five lenses, instant-fail on an unverifiable load-bearing claim), both publishing to MYMU. Stored rows carrying `lane='techonomic'` (or the `mindmaker_live` value they were re-laned to) read as Mindmaker via `normalizeLane()`; no code path rejects them. Full detail in `MINDMAKER_OS_ARCHITECTURE.md` §11.3 + the 2026-08-06 changelog entry.

---

## 1. The core shift

Today the Content tab is **one stream** of `content_ideas`, each tagged with a thematic `pillar_id` (5 pillars) and a multi-valued `distribution[]` array. There is no first-class notion of *which brand a piece is FOR*, and no cadence commitment per brand.

Krish runs **four distinct publishing commitments**, each with its own audience, cadence, format, source strategy, and voice. The upgrade introduces an explicit **lane** dimension — a brand/destination a piece of content is committed to — and makes the Content tab a **toggle between those four lanes**, each showing its own pipeline and whether Krish is on-pace.

Pillars stay — they become the *thematic* layer **inside** a lane (what the piece argues), orthogonal to the lane (where it ships).

> **Boundary (confirmed 2026-06-02):** Builder Economy *podcast* stays in the **guest pipeline (Inbound Visibility)** with Signal & Noise. The Content lane "Builder Economy" is the **Instagram page only**.

---

## 2. The four lanes

| # | Lane | Destination | Cadence | Format | What it is | Primary pillars | Source strategy |
|---|------|-------------|---------|--------|------------|-----------------|-----------------|
| 1 | **Signal & Noise** (written) | S&N written / Substack | **1 every ~2 weeks** | Long-form written deep-dive | How AI is reshaping **monetization inside media / adtech / martech** | `open_web_econ`, (martech/adtech monetization) | Perplexity deep research + S&N episode threads + adtech news |
| 2 | **Mindmaker** | LinkedIn + `mindmaker-live` | **2 / week** *(slots experimental — see note)* | Short-to-mid post | **(A)** Weekly *roundup of what matters for an AI leader*; **(B)** *live learning from the field* — a case study, a thing Krish is doing, or live news | `ai_decision_making`, `agentic_ops`, `portfolio_operating` | (A) Perplexity weekly AI-leadership scan; (B) Krish's own field log / OS activity / live news |
| 3 | ~~**Techonomic**~~ | n/a | n/a | n/a | *Retired 2026-08-06. Folded into Mindmaker LIVE; the investigative long-form survives as the "Full essay" format and the `investigation` rubric, not as a lane.* | n/a | n/a |
| 4 | **Builder Economy** (Instagram) | Instagram | **Daily** | IG post / caption + visual | **Positive, exciting, inspirational** news about what people are **building with AI that they couldn't have built before** | `builder_economy` | Perplexity/news sweep for "built with AI" wins, Product Hunt, Show HN, founder launches |

### Voice guardrails per lane
- Lanes 1–3 inherit the existing pillar `good_looks_like` / `anti_patterns` / `evidence_required` contracts (named entities, real figures, no AI-hype-soup).
- Lane 4 (IG) is the **one deliberately upbeat lane** — inspirational and accessible, not investigative. It needs its own light voice profile (celebratory, concrete "X built Y they couldn't before", visual-first) and a *relaxed* evidence bar vs lanes 1–3.

---

## 3. Data model

Minimal, additive — reuse `content_ideas`; add a lane dimension and a cadence ledger.

### 3.1 `content_ideas` additions
| Column | Type | Purpose |
|---|---|---|
| `lane` | text (enum) | `signal_noise` \| `mindmaker` \| `builder_economy_ig`. The brand this piece is committed to. Backfill from `distribution[]` (see §6). Legacy rows may hold `techonomic` (retired 2026-08-06) or `mindmaker_live`; both read as Mindmaker. |
| `lane_slot` | text, nullable | For multi-cadence lanes. Mindmaker: `roundup` \| `field_learning`. Null elsewhere. |
| `cadence_due_at` | timestamptz, nullable | When this slot is next due (denormalized from the cadence ledger for fast sorting). |

Existing columns already cover the rest: `state` (researching→drafting→…), `body`, `draft_link`, `scheduled_for`, `published_at`, `published_url`, `transformed_outputs`, `pillar_id`, `brand_fit_score`, `quality_score`, `source_*`, `concept_id`.

> Recommend a CHECK constraint on `lane`, and keep `distribution[]` as the *channel fan-out within a lane* (e.g. a Mindmaker piece still distributes to `['linkedin','mindmaker-live']`).

### 3.2 New table `content_cadence`
One row per lane (and slot), the commitment + where it stands.

| Column | Type | Purpose |
|---|---|---|
| `id` | text PK | e.g. `cadence:signal_noise`, `cadence:mindmaker:roundup` |
| `lane` | text | FK-ish to the enum |
| `slot` | text, nullable | `roundup` / `field_learning` for Mindmaker |
| `label` | text | "Signal & Noise deep-dive" |
| `interval_days` | int | 14, 3-4 (Mindmaker per slot), 7, 1 |
| `target_per_week` | numeric | 0.5 / 1 / 1 / 7 — for the "on pace" math |
| `last_published_at` | timestamptz | from the most recent published idea in the lane/slot |
| `next_due_at` | timestamptz | `last_published_at + interval` (or now if overdue) |
| `status` | text | `on_pace` \| `due_soon` \| `overdue` (derived nightly) |
| `streak` | int | consecutive on-time periods (loss-aversion) |

A nightly job (Cleo or a small workflow) recomputes `last_published_at` / `next_due_at` / `status` / `streak` from `content_ideas`.

---

## 4. UI spec — Content tab

### 4.1 Lane toggle (the headline ask)
A segmented control / tab strip at the top: **Signal & Noise · Mindmaker · Builder Economy**, plus an **"All"** option. Mirrors the existing Focus/All and venture-chip patterns already in the app (so it's consistent and cheap to build). Selecting a lane filters the board to that lane's pipeline. Each lane chip shows a **status dot** (green on-pace / amber due-soon / red overdue) and a count.

### 4.2 Per-lane header — the commitment bar
When a lane is selected, a compact **CadenceBar** (reusing the shared `DoThisNextHero` pattern — the legacy `NextActionStrip` it originally cited was retired 2026-06-18):
> **Signal & Noise** — 1 every 2 weeks · last shipped **11 days ago** · **next due in 3 days** · 🔥 4 on-time in a row · *[Start the next one]*

For Mindmaker (two slots) the bar splits: `Roundup — due Mon` / `Field learning — due Thu`. For Builder Economy: `Daily — today's post not drafted` with a 7-dot week tracker.

### 4.3 The board (per lane)
A simple **state-column or feed** view over `content_ideas` filtered to the lane:
`Researching → Drafting → Ready for review → Scheduled → Published`
Cards reuse `ContentIdeaCardActionable` with:
- pillar chip + brand-fit + quality score (existing)
- **lane-appropriate actions:** `Research with Perplexity` · `Generate draft` · `Approve` · `Schedule` · `Mark published` · `FeedbackButton` (already wired for `content_ideas`)
- the source snippet/url it came from

### 4.3a Research transparency + drill-down (Krish, decision 4)
Every auto-generated draft is **drafted in full** (all lanes) but must be **transparent and explorable**:
- **Research panel** on each draft — the Perplexity/Exa **sources, snippets, and citations** that back every claim, inline. A draft never appears as an unsourced black box.
- **"Dive deeper here"** — select a paragraph / sub-topic and fire a **scoped Perplexity follow-up** on just that area. Results append to the idea's research and the draft can **re-transform** with the deeper material. This is the "let me dive deeper into a specific area if needed" affordance.
- Provenance is stored on the idea (`source_url`, `source_snippet`, and a `research[]` log in `meta`) and **inherited by every transformed output**, so a Mindmaker post spun off a long-form investigation keeps the same citation trail.

### 4.4 "All" view
Cross-lane, sorted by `cadence_due_at` ascending so the most-overdue commitment surfaces first — i.e., *"what do I owe, and to whom, soonest."*

### 4.5 Builder Economy (IG) special-case
A lighter, **gallery-style** lane: image-forward cards (the inspirational "X built Y" item + a generated caption + suggested visual), a **"7 posts this week" tracker**, and a one-tap **"Queue for IG"** that drops the caption into the daily Instagram cron (the existing Builder Economy IG automation, if present — otherwise a new Cleo IG-draft step).

---

## 5. Generation pipeline (where Perplexity plugs in)

Each lane gets a **sourcing cron** → **draft** → **approve** → **publish**, reusing the existing Cleo + Agatha flow (`§8.6` of the architecture doc). The new ingredient is **Perplexity** at the sourcing/research step.

| Lane | Sourcing cron (new/updated) | Perplexity role | Draft step | Approve | Publish |
|---|---|---|---|---|---|
| Signal & Noise | weekly research sweep | Deep research: "AI × monetization in media/adtech/martech, last 2 weeks, named deals & figures" → seeds 2-3 idea candidates | Cleo long-form (voice + `open_web_econ` contract) | Agatha → Krish | **Wix (manual paste — no API)** |
| Mindmaker Roundup | weekly (e.g. Sun) | Perplexity scan: "most important AI developments for business leaders this week" → structured roundup outline | Cleo roundup post | Agatha → Krish | LinkedIn |
| Mindmaker Field | ad-hoc + 2nd weekly nudge | (light) Perplexity only to fact-check/contextualize Krish's field note | Cleo from Krish's raw note / OS activity | Agatha → Krish | LinkedIn |
| Mindmaker LIVE investigation | weekly investigative | **Primary engine:** Perplexity multi-query investigation of an emerging monetization model + compare/contrast, with citations | Cleo investigative long-form | Agatha → Krish | Mindmaker LIVE |
| Builder Economy IG | **daily** | Perplexity/news sweep: "impressive things built with AI in last 24-48h that weren't possible before" → 1-3 inspirational items | Cleo IG caption (upbeat voice) + visual suggestion | Krish quick-approve | **Manual for now** — Krish posts to @the_builder_economy (v1: caption + visual draft only) |

**Perplexity integration pattern (reuse what we just built):** the same `sonar-pro` HTTP call pattern already used by the Visibility Sweeper and the new Podchaser workflow. Store the per-lane research prompt in `system_config` (e.g. `content_research_signal_noise`) so prompts are tunable without touching workflows (fleet standard). Citations from Perplexity land in `content_ideas.source_url` / `source_snippet` so every draft is grounded.

> Perplexity is added to every sourcing cron, but it is the **lead** engine for the Mindmaker LIVE investigation and Builder Economy IG (freshness), and a **supporting** engine for the others.

---

## 5.5 Transform — the industrialized core (Krish, decision 5)

Krish's steer: *"We already have the Transform capability, which should be industrialized properly."* This becomes the **spine that connects the lanes**, not a side-button.

**The atom is a researched idea, not a post.** One piece of sourcing (a monetization investigation, a leader-roundup scan, a "built-with-AI" win) is a **core idea** carrying its research/citations. **Transform** is the engine that spins that core into **lane-specific outputs**, each in the right voice, length, and format — so a single investigation can simultaneously become a Mindmaker LIVE essay, a Mindmaker post, an S&N angle, and an IG caption, all sharing one citation trail.

Today's Transform (`Cleo | Content Transform` → `content_ideas.transformed_outputs` jsonb, channels: linkedin/newsletter/x/podcast) is the seed. Industrializing it means:

| Aspect | Today (ad-hoc) | Industrialized |
|---|---|---|
| Targets | 4 hard-coded channels | The **4 lanes × their channels**, each with a stored **voice + length + format + evidence contract** (from the pillar `good_looks_like` + lane profile) |
| Trigger | manual button | manual **and** part of each lane's pipeline; "Transform to other lanes" offered on any approved idea |
| Provenance | not inherited | every output **inherits the core idea's sources** (decision 4) |
| State | a jsonb blob | each output is trackable through `Drafting → Ready → Scheduled → Published` independently (own row linked via `related_idea_ids`, or a richer `transformed_outputs[]` with per-output state) |
| Voice | generic | per-lane voice profile in `system_config` (e.g. `content_voice_builder_economy_ig` = upbeat; `content_voice_signal_noise` = exec-to-exec) |
| Re-transform | n/a | after a **"dive deeper"** enriches the core, outputs can be **regenerated** with the new material |

**Recommended model:** keep the **core idea** as the parent `content_ideas` row (research + pillar + lane=`origin`), and represent each lane output as a **child** linked by `related_idea_ids` with its own `lane`, `state`, `body`, and inherited `source_*`. This gives every transformed post a real place on its lane's board and its own publish lifecycle, while the research stays single-sourced on the parent. (Alternative: a structured `transformed_outputs[]` with per-entry `{lane, state, body, sources}` — lighter, but harder to surface as first-class cards. **Parent/child rows recommended.**)

Pillars are unchanged by this: they remain the **theme tag**, selectable on any idea; Transform handles the **lane × format** multiplication.

---

## 6. Migration / backfill
- Derive `lane` for the existing 81 ideas from `distribution[]`:
  - contains `techonomic` → `techonomic` *(historical: that lane was retired 2026-08-06 and its rows re-laned to `mindmaker_live`)*
  - contains `signal-noise-pod` (and written intent) → `signal_noise`
  - contains `builder-economy-pod` → leave in guest pipeline context; **do not** auto-route to the IG lane (different intent)
  - `mindmaker-live` or `linkedin`-only → `mindmaker`
- Ambiguous/multi → set `lane` to the strongest signal, flag low-confidence ones for a quick Krish pass.
- Seed `content_cadence` with the four lanes (+ Mindmaker's two slots) and the intervals in §2.

---

## 7. Cadence enforcement (so commitments actually happen)
- `content_cadence.status` (`overdue`/`due_soon`) feeds the **Home `decisions_waiting`** surface and the **Today** tab, so an overdue lane is impossible to miss.
- Loss-aversion **streak** per lane (peak-end / goal-gradient, consistent with the Focus System).
- Optional Telegram nudge from Cleo when a lane goes `overdue`.

---

## 8. Build phases
1. **Schema + backfill** — `lane`/`lane_slot`/`cadence_due_at` on `content_ideas`; `content_cadence` table (configurable intervals/slots per decision 2); backfill 81 ideas; seed cadence rows. *(live, reversible)*
2. **Content tab UI** — lane toggle + CadenceBar + per-lane board + "All" view; **research panel + "dive deeper"** (§4.3a); IG gallery special-case. *(Control Center PR)*
3. **Industrialized Transform** (§5.5) — per-lane voice/format contracts in `system_config`, parent→child output rows with inherited provenance, re-transform after deep-dive. *(Cleo workflow + UI)*
4. **Perplexity sourcing crons** — one per lane (the Mindmaker LIVE investigation + Builder Economy IG first, highest leverage), prompts in `system_config`. *(n8n)*
5. **Cadence recompute job + Home/Today surfacing + nudges.**

No auto-publish nodes in v1: S&N → Wix (manual), Mindmaker → LinkedIn (existing approval→distribution flow), Builder Economy → Krish posts. Publish automation is a later, per-lane decision.

---

## 9. Decisions — RESOLVED (Krish, 2026-06-02)
1. **S&N written destination** — **Wix backend, no API.** Lane ends at `Ready`/`Scheduled`; Krish pastes into Wix manually. No auto-publish node.
2. **Mindmaker cadence/slots** — **experimental.** Target 2/week; the roundup vs field-learning split and days are tunable in `content_cadence` (not hard-coded). Iterate to find what works.
3. **Builder Economy IG** — account **@the_builder_economy**, but **getting going → Krish posts manually for now.** v1 = caption + visual-suggestion draft only; no IG publish integration yet.
4. **Auto-draft, but transparent** — **draft all lanes**, and **always show the research backing the draft** + a **"dive deeper into a specific area"** action (scoped Perplexity follow-up → re-transform). See §4.3a.
5. **Industrialize Transform** — Transform becomes the core engine (one researched idea → many lane outputs, shared citations, per-output lifecycle). See §5.5. Pillars stay as the theme tag.
