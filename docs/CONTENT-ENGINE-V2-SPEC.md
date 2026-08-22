# Content Engine v2 — Weekly Brief + Shifts Register

> Canonical build spec, locked with Krish 2026-07-10 after a three-repo audit (control-center, mm-ctrl, mindmaker) and a two-round interview. Mockups (approved): https://claude.ai/code/artifact/be24ea89-644c-4eaf-9d09-651869aacf18
>
> Supersedes the one-item-at-a-time pipeline described in `CONTENT_TAB_SPEC.md` for news-driven content. The Composer, factory push, voice guardrails, and cadence machinery carry forward.

## 1. North star

The content engine reads everything (the CTRL corroborated headlines pool, Krish's AI newsletters, Zara signals), synthesises instead of forwarding, and asks Krish for **5-10 typed decisions a week** in one weekend sitting. Two artifact kinds replace ~200 individual triage cards:

1. **The Weekly Brief** — one investigative opinion piece written for business leaders, assembled Friday 18:00 UTC, edited in the Composer, fanned out to multiple channel formats in one push, sent Monday. *(Amended 2026-08-08, Krish: the shape was Headlines / What this actually means / Perspectives, which produced a roundup with a comment attached. The week's stories are now **clues** in an argument: Standfirst carrying the verdict / The clues / The consensus (steelmanned) / Where the evidence lands / The next twelve months / My position. Each piece commits to ONE stance, either contradicting a widely held belief about AI or business building, or confirming a thesis about the next twelve months, read throughout through a commercialisation and corporate-strategy lens. Stored as `sections.stance` + `sections.belief`.)*
2. **Shifts** — a persistent register of macro movements (mm-ctrl's verified-trend logic, extended with cross-week identity), each with a dated evidence dossier, momentum trajectory, and honest provenance back to July 2025.

Everything else purges itself. The old pile becomes an ambient, read-only Feed.

## 2. Locked rules (Krish, 2026-07-10)

| # | Rule |
|---|---|
| R1 | Reader of the brief = business leaders (Krish's audience), not Krish-internal. |
| R2 | Destinations: the Mindmaker Live newsletter + LinkedIn (per-week selection; social cutdowns optional). *(Amended 2026-08-06: the Techonomic essay destination is retired. Techonomic is folded into Mindmaker LIVE, and its long-form register survives as the "Full essay" format, not a separate channel.)* |
| R3 | One news item never becomes one piece. The pipeline synthesises; the one-at-a-time stream becomes a Feed with zero obligations. |
| R4 | Decision load: 5-10/week, four types only: brief review, shift ruling (accept/merge/retire), graduation, purge preview (optional). |
| R5 | Architecture: shared pool, OS-owned brain. Read mm-ctrl `live_headlines_cache` (project `bkyuxvschuwngtcdhsyg`, READ-ONLY); all v2 state lives in the OS DB. Never write to the product DB. |
| R6 | Backdate: reconstruct Jul 2025 - Jun 2026 month-by-month via research agents, run through the same recurrence gate, provenance-labeled `reconstructed` vs `lived`. |
| R7 | Cadence: assemble Fri 18:00 UTC, review in one weekend sitting, push/send Mon, purge after. |
| R8 | The brief is a first-class Control Center artifact: rich-text editing (10/10), versioning, multi-format select, one push sends every selected format to Google Docs via the factory. |
| R9 | Brief arrives fully drafted (editorial job, not assembly job). |
| R10 | Purge = hard delete for time-sensitive items (no cold archive). Rescue converts to a Library candidate before purge. |
| R11 | Weekly rhythm is the default; shift proposals queue for the weekend sitting (no mid-week interrupts in v1). |
| R12 | Day-one migration: cluster the ~228 active cards once, fold shift-worthy evidence into dossiers, graduate evergreens, purge the rest. Start clean. |
| R13 | Mobile = one-thumb "finish the week": decision queue, magic edits, ship. Mobile can never start work; deep work is desktop-only. |
| R14 | No em dashes anywhere (existing PUB rules + `sanitizeVoice` continue to apply). Nothing auto-publishes (PUB-001). |

## 3. Data model (OS DB `gojpffsrxybbpbdzzrvs`)

New tables (RLS: anon SELECT, service_role ALL — house pattern; all writes via `/api/*`):

- **`shifts`** — the persistent register. `slug` (stable identity), `title`, `summary`, `implication`, `category` (mm-ctrl's 9 lanes), `status` (`proposed|active|fading|retired|library`), `first_seen_on`, `last_evidence_on`, `momentum` + `momentum_history` jsonb (per-week `{week, momentum, day_span, source_count, recent_count}`), totals, `provenance` (`reconstructed|lived|mixed`), `embedding` vector for identity matching, `decision` jsonb (last Krish ruling).
- **`shift_evidence`** — dated receipts. FK to shifts, `occurred_on`, `headline`, `source`, `url`, `provenance`, `week_label`. Append-only; quiet weeks are simply absent (never faked).
- **`weekly_briefs`** — the brief object. `week` ('2026-W28', unique), `title`, `status` (`assembling|ready|in_review|approved|pushed|sent|archived`), `sections` jsonb (structured headlines with why-lines + source ids), `body_md` (the editable master, markdown canonical), `versions` jsonb append-only, `stats` jsonb (read/clustered/fed/discarded counts for the honest ledger line), `formats` jsonb (per-channel doc URLs + timestamps), timestamps per lifecycle step.
- **`content_decisions`** — the finite weekly queue. `week`, `kind` (`brief_review|shift_proposal|shift_fading|graduation|purge_preview`), `ref` (shift id / brief id / idea id), `payload` jsonb (everything the card renders), `status` (`pending|done|dismissed`), `resolution` jsonb. Feeds the Content tab queue and (later) the unified `decisions_waiting` view.

`content_ideas` additions (the Feed keeps living here):
- `horizon text check ('news','evergreen') default 'news'`
- `expires_at timestamptz` — set at ingest for news horizon (next Monday purge boundary)
- `shift_id uuid references shifts(id)` — set when an item feeds a dossier (protects from purge)
- `library_at timestamptz` — graduation stamp (protects from purge)
- `source_type` CHECK widened with `pool_headline`

## 4. Engine (all Vercel `/api/*`, service role; crons in `vercel.json`, NOT n8n — zero n8n budget impact)

| Module | Trigger | What it does |
|---|---|---|
| `api/_pool.ts` | lib | Read-only client for the CTRL pool (`CTRL_SUPABASE_URL` + `CTRL_SUPABASE_SERVICE_KEY` env). |
| `api/_trendGate.ts` | lib | Pure port of mm-ctrl `news-trends.ts`: detection prompt shape, `verifyShift` (>=3 distinct days, >=3 distinct sources, >=3 real citations; hallucinated ids dropped), `computeMomentum` (daySpan*2 + sources + recent), constants. Plus the v2 extension: `matchToRegister` (embedding cosine >= .86 OR title trigram overlap) so detections attach to existing shifts instead of re-creating them. |
| `api/feed/ingest.ts` | cron daily 11:30 UTC | Pull yesterday's + today's pool rows, normalize to `content_ideas` (`horizon='news'`, `source_type='pool_headline'`, `expires_at` = next Mon 14:00 UTC), dedupe by URL + fingerprint. Newsletters keep arriving via the existing n8n Inspiration Sweep; Zara via her sweep. |
| `api/shifts/detect.ts` | cron Fri 17:30 UTC | Build 21-day corpus (feed + newsletters + zara, deliberately NOT deduped across days), Sonnet proposes shifts, gate verifies, register-match, upsert `shifts` + `shift_evidence`, append `momentum_history`, mark 3-quiet-week actives `fading`. Writes `content_decisions` rows for `shift_proposal` / `shift_fading`. Zero verified shifts = valid output. |
| `api/briefs/assemble.ts` | cron Fri 18:00 UTC | Read the week's items, pick the clue set that carries one argument, write a line of inference per clue, then draft the piece: the belief being tested (steelmanned first), the investigation that rules on it (mechanism, who pays, where margin moves), the twelve-month thesis graded against shifts-register momentum, and Krish's own position seeded from his week (bets/decisions). Grounded in the shifts register (title + standing implication + momentum) + krish-voice + content corpus. One retry on a shape miss, then throws. Writes `weekly_briefs` (status `ready`, version 1) + `brief_review` decision + `purge_preview` decision + graduation candidates (evergreen-horizon items cited 3+ times). |
| `api/briefs/[week].ts` | PATCH | Body/section edits from the Composer; every accepted change appends to `versions`. `sanitizeVoice` on write. |
| `api/briefs/[week]/revise.ts`, `chat.ts` | on demand | Reuse `_content.ts` helpers (transform axes, span rewrite, Cleo chat) against `body_md`. |
| `api/briefs/[week]/push.ts` | button | For each selected channel: factory webhook with channel-adapted payload (`krish_approved: true`, same contract as save-draft). Records `formats[]`, status `pushed`. One Telegram confirmation. |
| `api/purge/run.ts` | cron Mon 14:00 UTC | Hard-DELETE news-horizon rows past `expires_at` with `shift_id IS NULL AND library_at IS NULL`; archive the brief (`sent` -> `archived` if approved+pushed); write purge stats to `audit_log`. The 200-card pile becomes structurally impossible. |

Model tiering per MT-003: Sonnet for detect/assemble/essay; Haiku for why-lines and classification. Grounding: `content_voice_block`, `content_corpus`, Five Standards advisory scoring carries over.

## 5. UI (flag `VITE_CONTENT_V2_ENABLED` — ON in prod since 2026-08)

> **Current shape (2026-08-21).** The shipped rooms are **Built / Paid /
> Library** (`ContentV2Tab`, test ids `content-room-<id>`), with the brief
> queue folded into the deck rather than a "This Week" room. On mobile the
> tab leads with a **Queue** view — the finite decision deck
> (`MobileDecisionDeck`) — and the three rooms sit beside it as segments;
> the research entry point is desktop-only chrome, and creation runs
> through the app-wide + create sheet. Shifts in cross-cutting categories
> (governance, security, org) carry no lane by design and appear in both
> Built and Paid — since 2026-08-22 under a labelled "Also here" section,
> after the room's own shifts, so the repetition reads as a choice; the
> weekly detector also heals missing lanes on re-detection. The section
> below is the original spec, kept for the intent and the details that
> still hold (composer, feed semantics, purge).

Four rooms replace mode-switched triage (desktop `DesktopContent.tsx` + mobile `MobileContent.tsx`):

- **This Week** (default): BriefCard (title, assembled stamp, stats chips, Review and edit) + DecisionQueue (typed cards, four kinds, finite) + the ambient ledger sentence. Zero open-ended triage.
- **Shifts**: register grid (emerald identity: eyebrow, momentum sparkline from `momentum_history`, verdict chip Accelerating/Steady/Fading, totals, provenance bar) + dossier drawer (week-by-week evidence rows tagged lived/reconstructed; actions: Write from this shift -> Composer seeded with dossier as materials; Add to this week's brief; Retire).
- **Feed**: read-only stream of what the engine read (search/filter; one action: Rescue -> graduation candidate). Carries zero obligations.
- **Library**: graduated evergreens + retired-with-verdict shifts, tap-anytime -> Composer.
- **Composer upgrade**: TipTap editor (StarterKit + link + image), **markdown canonical** via tiptap-markdown so factory/Docs contracts are unchanged; visible version rail (restore); existing rail panels (Cleo chat, Refine, Materials, Research, Standards) untouched; new fan-out bar (channel checkboxes + "Push N formats to Google Docs"). Composer opens ideas AND briefs (`#/content?brief=2026-W28`).
- **Mobile (one-thumb contract, R13)**: decision queue one-card-at-a-time with progress + time estimate; brief section-by-section read mode with magic row (Tighten / Sharper claim / Harder ending / More data) previewing inline via the span-rewrite engine + "Tell Cleo" dictation (Web Speech API, degrade to text sheet); ship controls with the fan-out and one push. Composing/restructuring is desktop-only by design.
- **The editor's action deck (revised 2026-08-08, Krish: "the buttons at the bottom of the editor waste a lot of space")**: the edit chips, the revision preview and the ship controls are ONE bordered footer, not two stacked blocks. On narrow the fan-out collapses to a single line naming the selected formats (`FACTORY_FANOUT[].short`) and opens on tap, since the choice persists between weeks; Bin and Push share one row. Measured at 412px with the app's 1.2 zoom: 377 device px before, 198 after, a 47% cut. 256 with the fan-out list open, 243 at 360px in the worst case (dictation live, four formats selected). Desktop keeps the inline checkbox list and is unchanged in height.

## 6. Backfill + migration (one-shot scripts, `scripts/`)

- `scripts/backfill-shifts.ts` — for each month Jul 2025 - Jun 2026: research-agent reconstruction of that month's AI-for-business record (Perplexity/Exa/Brave, mindmaker EXCLUDE/INCLUDE relevance lists), normalized to dated story stubs, then the SAME gate + register-match run month by month in order, `provenance='reconstructed'`. Momentum history accrues so trajectories are real. Expect 8-15 durable shifts.
- `scripts/migrate-content-pile.ts` — cluster the ~228 active cards; shift-matching clusters append evidence (`lived`); evergreen-horizon survivors (3+ citations or Krish-protected) -> graduation decisions; everything else purged. Dropped/absorbed history (288 rows) deleted per R10.

## 7. Ship order

| PR | Contents | Gate |
|---|---|---|
| PR-A | Schema migration + engine core (pool client, trend gate port, ingest/detect/assemble/purge, briefs API) + crons; flag off | tsc + eslint green; seeded dry-run of detect+assemble against live pool data verified by SQL |
| PR-B | UI rooms + Composer rich text + fan-out + mobile queue; flag off | fixture/preview harness screenshots (desktop + 390px), zero-scroll invariant, boot-resilient Playwright walk |
| PR-C | Backfill + migration scripts; run once with logs into audit_log | shifts register populated, provenance bars honest, pile at zero |
| Flip | `VITE_CONTENT_V2_ENABLED=true` in Vercel + redeploy | Krish's live sign-off on the first assembled brief |
| PR-D+ | Repo-wide coherence pass: every other tab adopts the idiom (typed finite decisions, rooms, provenance honesty, thumb-zone mobile) | per-tab screenshots |

## 8. Explicitly out of scope (v1)

In-OS email sending (stays Substack paste), mid-week shift interrupts, cold archive of purged items, auto-publishing anywhere, writes to the mm-ctrl product DB.
