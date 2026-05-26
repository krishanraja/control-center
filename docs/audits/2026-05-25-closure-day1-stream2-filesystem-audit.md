# Mindmaker OS — Workspace Staleness Audit

- **Date:** 2026-05-25
- **Stream:** 2 (VPS workspace audit)
- **Run by:** Claude Code (Opus 4.7) driving via SSH `root@5.161.56.37`
- **Status:** **COMPLETE**
- **Companion:** Stream 1 (Supabase) report at `docs/audits/2026-05-25-closure-day1-stream1-complete.md` in `krishanraja/control-center` (commit `2328326`+; architecture-doc integration in commit `fe2d04b`).

## TL;DR

The workspace is **mostly clean of stale closed-concept references** once false positives are filtered out. The only meaningful contamination is in **`warm/`** (agent-report accumulators) and in a smaller way in **memory files** for one specific historical concept (Felix Apollo 1,894 campaign — killed verbally on May 8, superseded in Supabase since May, but explicitly identified in `2026-05-25.md` memory as the bug that triggered the whole audit). Layer 1 core configs, Layer 9 hot files, Layer 10 agent SKILL.md briefs, and Layer 4 action docs are clean once you disambiguate the apollo.io API and Vertex AI service from the killed campaign / Vertex Inc lead respectively. No filesystem modifications were made.

## 0. Stream 1 verification

All five database-level checks passed:

- **`concept_decisions` table:** exists. Disney row present — `decision='closed'`, `decided_by='krish'`, `decided_at=2026-05-25T15:25:46.903501+00:00`, reason `"Day 1 canary test 2026-05-25: validating concept-level closure architecture"`.
- **`status_change_log` table:** exists. Disney transition logged — `leads/d2dd4b08-...74, ready → closed_lost, source=rpc:close_concept, changed_by=krish`.
- **Disney lead:** `status=closed_lost`, `concept_id=concept:org:disney`, `updated_at=2026-05-25T15:25:46.903501+00:00`. **NOTE: status is `closed_lost`, NOT `'dead'` — documented Stream 1 deviation (runbook target `'dead'` violated `leads_status_check`; `'closed_lost'` is the constraint-permitted substitute).**
- **4 outreach concepts backfilled:** Alma Media Corp → `concept:org:alma-media-corp`, Disney → `concept:org:disney`, Marketbridge → `concept:org:marketbridge`, Vertex Inc. → `concept:org:vertex-inc-`. All four tasks `status=superseded`.
- **`audit_log` `concept_closed` event:** present — target `concept:org:disney`, actor `krish`, display `"Concept concept:org:disney closed: 0 task(s), 1 lead(s)..."`.

`home_intelligence.top_three` still shows Disney as the revenue card. **Expected** — Stream 1 could not force-trigger the Marcus Daily Brief workflow because it uses the legacy `n8n-nodes-base.cron` trigger which the n8n public REST API and MCP `execute_workflow` tool both reject. The next scheduled 06:30 UTC tick (2026-05-26) will refresh `top_three`. Stream 1 verified directly that `marcus_daily_pull()` returns zero Disney mentions, so the data path is proven Disney-free.

**Also noted:** the VPS-canonical `MINDMAKER_OS_ARCHITECTURE.md` is still the pre-closure-architecture version (84154 bytes, modified 2026-05-25 13:21 UTC). The repo mirror was updated at commit `fe2d04b` (16:33 UTC) but Krish has not yet synced VPS ← repo. This is on Krish per §21 of the architecture doc.

## 1. Memory files (Layer 8) — LOW-MEDIUM risk (one concept)

- **File count:** 34 top-level `.md` files (plus `memory/` subdirs not separately audited)
- **Total size:** 320 KB
- **Date range:** `2026-04-14.md` to today
- **Per-concept hits (raw counts, before disambiguation):**
  - disney → 0 files, 0 occurrences
  - apollo → 21 files, 45 occurrences ← AMBIGUOUS
  - vertex → 0 files, 0 occurrences
  - marketbridge → 0 files, 0 occurrences
  - alma media → 0 files, 0 occurrences
- **`concept_id` slug forms:** 0 in any memory file (expected)

### Apollo disambiguation in memory

The raw "apollo" count splits cleanly into two distinct concepts. Pattern-matched explicitly:

- **Felix Apollo 1,894 outreach campaign (the stale closed concept):** ~15 occurrences across 14 files (2026-04-16 to 2026-05-25). Pattern matched: `apollo[[:space:]]+1[,.]894|felix[[:space:]]+apollo|apollo[[:space:]]+campaign|apollo[[:space:]]+outreach`. Sample lines:
  - `2026-05-08.md:77: **Apollo 1,894 campaign** — KILLED by Krish. Do not revisit.`
  - `2026-05-11.md:23: **Apollo 1,894 campaign task:** STILL OPEN as 'active' in Supabase despite Krish killing it verbally May 8 — needs to be closed`
  - `2026-05-13.md:13: - **Apollo 1,894 outreach campaign:** Ready to deploy since Apr 17 (26 days idle)`
  - `2026-05-25.md:19: State of the Union was scanning memory files for active tasks instead of querying Supabase. Since memory files are append-only, completed/killed tasks persisted forever in the SOTU output (e.g., Felix Apollo 1,894 campaign — superseded in Supabase since May but surfaced from April memory files).`
- **Apollo.io (the lead-sourcing API):** ~14 occurrences across 14 files (2026-04-23 to 2026-05-19). All are infrastructure-health log lines (e.g. `Apollo.io: degraded`, `Apollo.io: DEGRADED — 422 on health endpoint`, `Apollo key rotated`). Not stale, not closure-related.

**Risk:** LOW-MEDIUM. The Felix Apollo campaign references are real stale-concept hits. But this concept has not been formally closed via `concept_decisions` yet (Day 1 closed only Disney; Day 2 batch is Marketbridge/Vertex/Alma). When Day 4+ closes the Felix Apollo concept, this is what synthesis agents will need to handle: 15 files with mentions, plus the 2026-05-25 diagnosis entry itself.

## 2. Warm reports (Layer 7) — HIGH risk (the primary contamination surface)

- **Total size:** 1.8 MB across 135 files (`.json` + `.md`)
- **Top accumulators (size):**
  - `handoff-queue.json` — 207 KB
  - `stage-pipeline.json` — 100 KB
  - `visibility-pipeline.json` — 63 KB
  - `agent-reports/vera-weekly-*.json` — multiple 40-46 KB files
  - `agent-reports/leo-cro-*.json` — multiple 34-45 KB files
- **Vera daily/weekly reports:** 27 files (daily 2026-05-01 → 2026-05-25; weekly snapshots)
- **Felix enterprise-gigs reports:** 17 files

### Per-concept hits in `handoff-queue.json` (the 207KB live accumulator)

| Concept | Occurrences |
|---|---|
| Disney | 7 |
| Apollo | 0 |
| Vertex | 3 |
| Marketbridge | 4 |
| Alma Media | 4 |

`stage-pipeline.json` and `visibility-pipeline.json` are zero across all four concepts — they cover different pipelines (podcast stages, speaking targets) and don't carry leads.

### Aggregated across ALL warm files (after disambiguation)

| Concept | Files | Notes |
|---|---|---|
| Disney | 26 | Lead/task closure concept (Day 1 closed) |
| Vertex Inc | 33 | Lead concept (Day 2 candidate) |
| Alma Media | 34 | Lead concept (Day 2 candidate) |
| Marketbridge | 22 | Lead concept (Day 2 candidate) |
| Felix Apollo campaign | 29 | Killed concept (Day 4+ closure target) |

(Counts used the explicit phrase `Vertex Inc` and the Felix-Apollo regex to exclude false positives from Google Vertex AI and the apollo.io infrastructure.)

- **`concept_id` slug forms in warm/:** 0 (expected — slugs are brand new)

**Risk:** HIGH. Warm reports are loaded by synthesis agents (Marcus, Vera, Leo) on session wake. The `handoff-queue.json` file alone, at 207KB, contains 7 Disney references against a row that is now `closed_lost`. Until Day 3 wires synthesis paths to query `concept_decisions` first, agents reading these reports will see closed concepts as live work.

## 3. Active templates (Layer 5) — LOW

- 29 `*.md` files (legacy specs)
- 0 templates mention `task closure`, `close cycle`, or `task lifecycle`
- 0 templates mention `concept_id`, `concept_decisions`, or `concept identity`
- 2 templates reference apollo (both apollo.io infrastructure mentions, not the campaign): `bd-agent.md`, `vera-quality-audit.md`
- No disney / vertex / marketbridge / alma media references

**Risk:** LOW. Templates are not loaded at session wake; they are legacy authoring specs.

## 4. Active action docs (Layer 4) — CLEAN

- 14 `*-action.md` files, one per production agent
- 0 references to disney / apollo (campaign sense) / vertex / marketbridge / alma media
- Freshness: 13/14 files refreshed today at ~13:14 UTC (render-plan.py cron is healthy); `arlo-action.md` is stale from 2026-04-27 (out of scope for this audit; flag for follow-up)
- 0 slug references (expected)

**Risk:** LOW. The render-plan.py renderer is doing its job — these files are clean.

## 5. Hot files (Layer 9) — LOW after disambiguation

- `standards-digest.md` — 139 lines, 27 KB (regenerated nightly from `standards_registry`)
- `systems.md` — 81 lines, 4.3 KB (hand-edited)
- `priorities.md` — 24 lines, 294 bytes (hand-edited)
- Apollo refs: in `standards-digest.md` (the apollo.io rules) and `systems.md` (apollo.io endpoint listing). Both are apollo.io API, not the campaign.
- Vertex ref: in `systems.md` (Google Cloud Vertex AI infrastructure mention).
- 0 disney / marketbridge / alma media
- `agatha-inbox/` contains 1 existing note (`nova-visibility-2026-05-11.md`); the Stream 2 inbox note will be added next to it.

**Risk:** LOW. The apollo and vertex hits are infrastructure references, not stale-concept references.

## 6. Layer 1 core configs — CLEAN after disambiguation

File inventory + sizes:

```
AGENTS.md             10378 bytes, 160 lines
AGENTS_REFERENCE.md    9736 bytes
HEARTBEAT.md           5014 bytes, 52 lines
IDENTITY.md             230 bytes
MEMORY.md              5666 bytes, 67 lines
MINDMAKER_OS_ARCHITECTURE.md  84154 bytes, 1252 lines  (still the pre-closure version on VPS)
ORG.md                11205 bytes, 185 lines
SOUL.md                9120 bytes, 215 lines
TOOLS.md              25955 bytes, 460 lines
USER.md                1562 bytes, 36 lines
USER_REFERENCE.md      4129 bytes
```

### Closed-concept refs in core configs

- **disney:** 1 hit in `MINDMAKER_OS_ARCHITECTURE.md` line 1207 — the PR #67 changelog entry mentioning the Disney "Unnamed" fix. **Not** a stale closure ref; it is audit history. Will be replaced when Krish syncs the updated arch doc from `fe2d04b`.
- **apollo:** 7 files (AGENTS.md, HEARTBEAT.md, MINDMAKER_OS_ARCHITECTURE.md, ORG.md, SOUL.md, TOOLS.md, USER_REFERENCE.md). **All disambiguated to Apollo.io infrastructure** — `Apollo / lead sourcing / ICP filtering`, `Apollo.io: NEW KEY VERIFIED`, `Nell Apollo Contact Enrichment`, `Apollo.io API. Rate limits are per-minute not per-day`, etc. Zero references to the Felix Apollo campaign.
- **vertex:** 2 files (TOOLS.md, USER_REFERENCE.md). **All disambiguated to Google Vertex AI** — `Different from Vertex AI (which uses service accounts)`, `Google Cloud / Vertex AI`, `Cloud Run, Vertex AI, heavier workloads`. Zero references to the Vertex Inc lead.
- **marketbridge, alma media:** 0 hits anywhere.

### Closure primitives in core configs

- `concept_id`, `concept_decisions`, `status_change_log`, `close_concept`, `reopen_concept`: **all 0**. Expected — the VPS-canonical `MINDMAKER_OS_ARCHITECTURE.md` is the pre-closure version. After Krish syncs the repo update (commit `fe2d04b`), these terms will appear.

**Risk:** LOW. Once the architecture-doc sync happens, the only Disney mention in core configs (the changelog reference) will be replaced/superseded by the updated Day-1 changelog entries.

## 7. Agent SKILL.md files (Layer 10) — CLEAN after disambiguation

- 14 `agent-*/SKILL.md` files (matches the 14-agent fleet)
- Total brief size: ~3,244 lines across the 9 largest agents (nova 217 → cleo 285)
- **Closed-concept refs:** apollo present in 6 of 14 — felix(4), hunter(2), kai(8), leo(2), nell(6), zara(6) = 28 total occurrences. **All disambiguated to Apollo.io** (the API):
  - felix: `Apollo.io | Lead enrichment before first contact`, `Apollo before first contact, always`, `Use Apollo freely for lead research`
  - hunter: `Apollo.io health degraded since 2026-04-14 (handoff to Kai)`
  - kai: `Per-vendor dashboards (Stripe, Instantly, Apollo, etc.)`, `Apollo.io — rate-limited 3x last week`, `Apollo.io API. Rate limits are per-minute not per-day`
  - leo: `Apollo campaign data` (in a per-sequence metrics context — about outbound metrics, not the killed Felix Apollo)
  - nell: `Lead sourcing (Apollo/Zara provide; I sequence)`, `Nell | Apollo Contact Enrichment`, `Apollo.io | Enrichment per lead/guest`
  - zara: `5× daily signal sweep — Brave + Apollo enrichment`, `Brave Search + Apollo API access`, `Apollo credit upgrades`
- disney / vertex / marketbridge / alma media: **0 hits in any SKILL.md**
- Closure primitives (`concept_id`, `concept_decisions`, `close_concept`): **0 hits** (expected; briefs have not been updated yet)

**Risk:** LOW. Briefs are clean. When Day 3/4 updates agent briefs to teach them about `concept_decisions`, that is an additive change, not a stale-reference cleanup.

## 8. Render scripts (read-only inspection)

`scripts/` contains all 3 expected scripts:

```
regenerate-standards-digest.py  2261 bytes  (executable)
render-identity.py              7904 bytes  (executable)
render-plan.py                  9480 bytes  (executable)
```

- **`grep concept_decisions`** across all scripts: **0 matches**
- **`grep concept_id`** across all scripts: **0 matches**

Expected — the `concept_decisions` table did not exist before today. This is the Day 3 wiring task.

### Day 3 priority for renderers

| Script | Reads from Supabase | Day-3 wiring needed? |
|---|---|---|
| `render-plan.py` | `agent_plans` rows | **YES — high priority.** Should `LEFT JOIN concept_decisions cd ON cd.concept_id = agent_plans.concept_id` (Day 2 will add `concept_id` to `agent_plans` if applicable) and filter where the concept is closed. Otherwise plan rows referencing closed concepts get re-rendered every 15 min. |
| `render-identity.py` | `agents.brief_content` | NO. Briefs are static identity — concept independence is a feature, not a bug. |
| `regenerate-standards-digest.py` | `standards_registry` | NO. Standards are concept-independent. |

## 9. Day-2 batch-closure precursor counts

For each of the three at-risk concepts Stream 1 identified, plus the Day-1 Disney baseline:

| Concept | memory | warm | active | hot | core | skills |
|---|---|---|---|---|---|---|
| Disney (Day 1 closed) | 0 | 26 | 3 | 0 | 1 | 0 |
| Marketbridge | 0 | 22 | 0 | 0 | 0 | 0 |
| Vertex Inc | 0 | 33 | 0 | 0 | 0 | 0 |
| Alma Media | 0 | 34 | 0 | 0 | 0 | 0 |
| **Felix Apollo campaign** | **15** | **29** | TBD | TBD | TBD | TBD |

Observations:

- **All four enterprise lead concepts are concentrated almost entirely in `warm/`** — 22 to 34 files each. This is consistent with how Vera daily and Felix enterprise-gigs reports accumulate.
- **Day 2 closures (Marketbridge / Vertex Inc / Alma Media) will be structurally identical to Disney** — clean db cascade, ~22-34 warm files holding stale references, zero contamination elsewhere.
- **Disney has 3 hits in `active/`** that the per-agent action-doc audit (§7.4) did not surface. They are not in `*-action.md` files but somewhere else under `active/` (likely `active/initiatives/` or `active/templates/`). Out of scope for Day 1; flag for follow-up.
- **Felix Apollo campaign is the biggest unhandled stale-concept** (44+ files combined). It is not in the Day 1 at-risk batch (Stream 1 identified only Marketbridge/Vertex/Alma based on the matching outreach-task pattern). Day 4+ closure target. When the time comes, `compute_concept_slug('Felix Apollo 1894')` would yield `felix-apollo-1894` or similar; the canonical slug is a Day-4 design decision.

If any single concept-vs-layer count is over ~20, that is a signal the corresponding generator workflow is duplicating. Here, Disney/Marketbridge/Vertex/Alma all sit at 22-34 in warm — that is Vera daily-report cadence (27 daily + weekly snapshots = ~30 files in the last 30 days), so the count is mostly cadence, not duplication. No new generator-misfire smell from this data.

## 10. What this means for Days 2 to 5

**Priority order based on this audit:**

1. **Day 2: extend `concept_id` to `guests`, `visibility_targets`, `content_ideas`, `customers`, `opportunities`**, plus build the Closure Intent Receiver workflow (Schedule Trigger node — not `cron` — so it stays manually executable). Close the three at-risk batch (Marketbridge, Vertex Inc, Alma Media) using `close_concept`. Each will cascade just like Disney did.
2. **Day 2 housekeeping decision (open question for Krish):** canonicalize on `closed_lost` for the leads terminal status, OR ALTER `leads_status_check` to add `'dead'`. **Both streams recommend the former** (lower blast radius; vocabulary already established in the schema and presumably used by other code paths).
3. **Day 3: synthesis-time `concept_decisions` lookup.** Add the JOIN to `marcus_daily_pull()` and to the equivalent fetches Vera/Agatha do during synthesis. Also wire `render-plan.py` to filter closed concepts. This is the structural fix for the bug `2026-05-25.md` memory entry diagnosed.
4. **Day 4: batched triage of the Felix Apollo campaign concept.** This is the biggest single stale-concept presence in the workspace (44+ files). Decide the canonical slug, call `close_concept`, and (separately) decide the memory-file treatment: do NOT auto-edit memory files; either prepend a one-time "concept retired" footnote, or rely on synthesis agents querying `concept_decisions` first per #3.
5. **Day 5: real-event listeners.** Stripe `customer.subscription.created` → close_concept on the lead; Gmail draft sent → close_concept on the email_drafts; Instantly campaign start → close_concept on the outbound-task. Update AGENTS.md with the new closure rules. Then sync VPS ← repo for the architecture doc so the closure primitives are documented in the file every agent reads at wake.

**Specific actions implied by this audit:**

- Memory file scrub strategy: do **NOT** auto-edit memory files. Instead, change synthesis agents (Marcus, Vera, Agatha) to consult `concept_decisions` before treating any memory-file reference as live. Alternative if Krish prefers a more aggressive cleanup: a one-off "concept retired" footnote prepended once per closed concept to the memory files that mention it — but this is risky because memory files are also Krish's reasoning trail.
- Warm-report rotation: `handoff-queue.json` at 207KB is suspect. Snapshot it, archive everything older than 14 days, start fresh. This is independent of closure architecture; just hygiene. **Not** a Day 2 priority.
- `render-plan.py` (Day 3): when reading `agent_plans`, JOIN against `concept_decisions` and exclude rows whose concept_id has `decision='closed'` with `superseded_at IS NULL`.
- Agent brief audit: zero stale closed-concept refs in any brief (after disambiguation). When closure intent translation goes live (Day 2), only Agatha's brief needs to gain the closure-intent translation protocol from §7.7 of the architecture doc; the other 13 briefs are unaffected.
- Architecture doc sync: the VPS-canonical `MINDMAKER_OS_ARCHITECTURE.md` is the **pre-Day-1 version** (84KB, modified 2026-05-25 13:21 UTC). The repo mirror was updated to the post-Day-1 version at commit `fe2d04b` (2026-05-25 16:33 UTC). Krish needs to sync VPS ← repo so the on-VPS canonical reflects the closure architecture.

## 11. Open questions for Krish

1. **Canonicalize on `closed_lost` (preferred by both streams) OR ALTER `leads_status_check` to add `'dead'` to match the original runbook?** Recommend the former.
2. **Felix Apollo campaign concept slug:** when Day 4 closes this, what is the canonical form? Options:
   - `concept:campaign:felix-apollo-1894` (most specific)
   - `concept:campaign:felix-apollo`
   - `concept:org:apollo-1894` (less likely — Apollo isn't an org)
   Recommend `concept:campaign:felix-apollo-1894` to keep the campaign identity precise.
3. **Memory file treatment when concepts close:** option A — synthesis-time JOIN only (preserves Krish's reasoning trail intact); option B — one-time "concept retired: see audit_log YYYY-MM-DD" footnote prepended to affected files (more aggressive cleanup, slightly mutates Krish's history). Recommend A.
4. **Disney's 3 references in `active/`** (not in `*-action.md`): out of scope to fix today, but worth understanding what they are. Likely under `active/initiatives/` or similar — quick follow-up.

---

## Appendix A: Files produced this session

- `/root/.openclaw/workspace/audits/2026-05-25-filesystem-staleness.md` — this report
- `/root/.openclaw/workspace/hot/agatha-inbox/2026-05-25-closure-day1-stream2.md` — Agatha inbox note

No other workspace files were modified.

## Appendix B: Companion documents

- Stream 1 completion report: `docs/audits/2026-05-25-closure-day1-stream1-complete.md` in `krishanraja/control-center` (commit `2328326`)
- Architecture doc update: `docs/MINDMAKER_OS_ARCHITECTURE.md` in same repo (commit `fe2d04b`) — integrates the closure architecture across all 21 sections of the OS reference

End of report.
