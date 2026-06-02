# Content Tab Upgrade — Lanes Spec

**Status:** Draft for Krish review · 2026-06-02
**Author:** Claude (Opus 4.8) on behalf of Krish

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
| 2 | **Mindmaker** | LinkedIn + `mindmaker-live` | **2 / week** | Short-to-mid post | **(A)** Weekly *roundup of what matters for an AI leader*; **(B)** *live learning from the field* — a case study, a thing Krish is doing, or live news | `ai_decision_making`, `agentic_ops`, `portfolio_operating` | (A) Perplexity weekly AI-leadership scan; (B) Krish's own field log / OS activity / live news |
| 3 | **Techonomic** | `techonomic` | **1 / week** | Investigative deep-dive | **Investigative journalism** on how AI is changing **monetization** — live examples of new/emerging models, compare & contrast | `open_web_econ`, `builder_economy` | **Perplexity-led** investigative research (primary), Exa, news |
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
| `lane` | text (enum) | `signal_noise` \| `mindmaker` \| `techonomic` \| `builder_economy_ig`. The brand this piece is committed to. Backfill from `distribution[]` (see §6). |
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
A segmented control / tab strip at the top: **Signal & Noise · Mindmaker · Techonomic · Builder Economy**, plus an **"All"** option. Mirrors the existing Focus/All and venture-chip patterns already in the app (so it's consistent and cheap to build). Selecting a lane filters the board to that lane's pipeline. Each lane chip shows a **status dot** (green on-pace / amber due-soon / red overdue) and a count.

### 4.2 Per-lane header — the commitment bar
When a lane is selected, a compact **CadenceBar** (reusing the `NextActionStrip` pattern):
> **Signal & Noise** — 1 every 2 weeks · last shipped **11 days ago** · **next due in 3 days** · 🔥 4 on-time in a row · *[Start the next one]*

For Mindmaker (two slots) the bar splits: `Roundup — due Mon` / `Field learning — due Thu`. For Builder Economy: `Daily — today's post not drafted` with a 7-dot week tracker.

### 4.3 The board (per lane)
A simple **state-column or feed** view over `content_ideas` filtered to the lane:
`Researching → Drafting → Ready for review → Scheduled → Published`
Cards reuse `ContentIdeaCardActionable` with:
- pillar chip + brand-fit + quality score (existing)
- **lane-appropriate actions:** `Research with Perplexity` · `Generate draft` · `Approve` · `Schedule` · `Mark published` · `FeedbackButton` (already wired for `content_ideas`)
- the source snippet/url it came from

### 4.4 "All" view
Cross-lane, sorted by `cadence_due_at` ascending so the most-overdue commitment surfaces first — i.e., *"what do I owe, and to whom, soonest."*

### 4.5 Builder Economy (IG) special-case
A lighter, **gallery-style** lane: image-forward cards (the inspirational "X built Y" item + a generated caption + suggested visual), a **"7 posts this week" tracker**, and a one-tap **"Queue for IG"** that drops the caption into the daily Instagram cron (the existing Builder Economy IG automation, if present — otherwise a new Cleo IG-draft step).

---

## 5. Generation pipeline (where Perplexity plugs in)

Each lane gets a **sourcing cron** → **draft** → **approve** → **publish**, reusing the existing Cleo + Agatha flow (`§8.6` of the architecture doc). The new ingredient is **Perplexity** at the sourcing/research step.

| Lane | Sourcing cron (new/updated) | Perplexity role | Draft step | Approve | Publish |
|---|---|---|---|---|---|
| Signal & Noise | weekly research sweep | Deep research: "AI × monetization in media/adtech/martech, last 2 weeks, named deals & figures" → seeds 2-3 idea candidates | Cleo long-form (voice + `open_web_econ` contract) | Agatha → Krish | Substack/manual |
| Mindmaker Roundup | weekly (e.g. Sun) | Perplexity scan: "most important AI developments for business leaders this week" → structured roundup outline | Cleo roundup post | Agatha → Krish | LinkedIn |
| Mindmaker Field | ad-hoc + 2nd weekly nudge | (light) Perplexity only to fact-check/contextualize Krish's field note | Cleo from Krish's raw note / OS activity | Agatha → Krish | LinkedIn |
| Techonomic | weekly investigative | **Primary engine:** Perplexity multi-query investigation of an emerging monetization model + compare/contrast, with citations | Cleo investigative long-form | Agatha → Krish | Techonomic |
| Builder Economy IG | **daily** | Perplexity/news sweep: "impressive things built with AI in last 24-48h that weren't possible before" → 1-3 inspirational items | Cleo IG caption (upbeat voice) + visual suggestion | Krish quick-approve | IG (daily cron) |

**Perplexity integration pattern (reuse what we just built):** the same `sonar-pro` HTTP call pattern already used by the Visibility Sweeper and the new Podchaser workflow. Store the per-lane research prompt in `system_config` (e.g. `content_research_techonomic`) so prompts are tunable without touching workflows (fleet standard). Citations from Perplexity land in `content_ideas.source_url` / `source_snippet` so every draft is grounded.

> Perplexity is added to **all four** sourcing crons, but it is the **lead** engine for Techonomic (investigative) and Builder Economy IG (freshness), and a **supporting** engine for the others.

---

## 6. Migration / backfill
- Derive `lane` for the existing 81 ideas from `distribution[]`:
  - contains `techonomic` → `techonomic`
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
1. **Schema + backfill** — `lane`/`lane_slot`/`cadence_due_at` on `content_ideas`; `content_cadence` table; backfill 81 ideas; seed cadence rows. *(live, reversible)*
2. **Content tab UI** — lane toggle + CadenceBar + per-lane board + "All" view; IG gallery special-case. *(Control Center PR)*
3. **Perplexity sourcing crons** — one per lane (Techonomic + IG first, highest leverage), prompts in `system_config`. *(n8n)*
4. **Cadence recompute job + Home/Today surfacing + nudges.**
5. **IG publish path** — confirm/extend the daily Instagram automation for lane 4.

---

## 9. Open decisions for Krish
1. **Signal & Noise written destination** — Substack? A section of themindmaker.ai? Techonomic-style page? (Determines the publish step.)
2. **Mindmaker roundup day** — fixed day (e.g. Monday) for the roundup, second slot mid/late week for the field learning?
3. **Builder Economy IG** — is there an existing IG automation/account API to publish into, or is "draft caption + you post manually" fine for v1?
4. **Auto-draft vs research-only** — for each lane, should the cron auto-generate a *draft* (Krish edits/approves), or only assemble *research + an outline* (Krish writes)? (Suggest: auto-draft for IG + Mindmaker roundup; research+outline for the two deep-dive lanes.)
5. **Pillars inside lanes** — keep all 5 pillars selectable in every lane, or constrain each lane to its primary pillars?
