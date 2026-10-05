# Workspace layout and the agent operating contract: reference detail

> **Reference detail for sections 6 and 7 of [`MINDMAKE_OS_ARCHITECTURE.md`](../MINDMAKE_OS_ARCHITECTURE.md).**
> This is the deep text that used to sit inside the architecture doc, moved here on 2026-10-05 so the core
> stays small enough for an agent to load. It was written between May and October 2026 and was not
> re-verified line by line on the move. **The core, its section 0a (the canon) and the live source named in
> the core win over anything below.** Dated notes inside the text are history, not current state.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

## Known stale in this file (checked 2026-10-05)

- Any line describing a Telegram message, push or "ping" to Krish. The OS has been pull-only since 2026-09-06 (core 0a.4).
- Any line describing an agent writing a Google Doc into Drive, or `sync-to-drive.py`, `cc-doc-creator.sh` or `google_drive_sync` as live. All retired 2026-10-05 (core 0a.5).
- Arlo can no longer commit or push to this repository (enforced 2026-10-05: the VPS clone's push URL is anonymous).
- Do not run `sync-briefs-to-skills.sh`: its Google Doc sources are gone and a run would gut every brief. `agents.brief_content` is the only brief source.

---

## 6. Workspace architecture (Claude Code agents)

### 6.1 Standard layout

Every Claude Code agent workspace follows the same file convention. Loading order on session wake is described in §7.

```
workspace/
  (no architecture doc in the workspace since 2026-09-07: it lives only in the control-center repo, §0c)
  IDENTITY.md         - name, role, emoji, vibe
  USER.md             - who the agent serves and how
  ORG.md              - fleet-wide identity (every agent loads this)
  SOUL.md             - personality, voice, operating principles
  CLAUDE.md           - current operating contract (Session Startup Protocol; lives at /root/.openclaw/CLAUDE.md)
  TOOLS.md            - every API/credential/endpoint the OS uses
  MEMORY.md           - long-term curated memory; ONLY loaded in direct Krish chats
  HEARTBEAT.md        - periodic checklist for heartbeat polls
  memory/             - YYYY-MM-DD.md daily logs
  hot/                - runtime-managed: standards-digest.md, systems.md, agatha-inbox/
  warm/               - working docs: agent plans, reports, signal files
  active/             - live state: action docs (rendered from agent_plans), in-flight initiatives
  cold/               - archive
  reference/          - long-lived per-topic documentation
  scripts/            - automation (render-identity.py, regenerate-standards-digest.py, …)
  skills/             - workspace-local skills (per-agent SKILL.md is at /root/.openclaw/skills/agent-{id}/SKILL.md)
  supabase/           - DB helper scripts
  audits/             - periodic audit reports (e.g. 2026-05-25-filesystem-staleness.md)
  brand/              - brand assets
```

### 6.2 Agatha's workspace is the canonical one

`/root/.openclaw/workspace` is the *main* workspace. Agatha is COO and shares this filesystem with the system itself (cron scripts, render pipeline, the shared skills library). Other agent workspaces (`workspace-ops`, `workspace-cleo`, etc.) are slimmer - they inherit `ORG.md` content via load order but have their own `IDENTITY.md` / `SOUL.md` / `MEMORY.md`.

### 6.3 Shared skills library

Path: `/root/.openclaw/skills/`, ~108 skills. Loaded by absolute path from any workspace.

| Skill | Purpose |
|---|---|
| `agent-{id}/SKILL.md` | Per-agent operating manual - rendered from `agents.brief_content` every 15 min. **Edit the DB, not the file.** |
| `krish-voice/SKILL.md` | Krish's writing voice - **mandatory before any outbound content or email draft** (rules V-001..V-007). The *how*. |
| `content-corpus/SKILL.md` | The channel corpus - **mandatory companion to krish-voice for any named channel or outbound**. The *what, who, and how-good*: per-channel mandate (Built / Signal & Noise / Mindmake's publication, including the long-form investigation format), the lead + visibility overlay, and the Five Standards gate (undeniably unique, well-researched, thoughtful, kind, helpful). The investigation playbook was retitled *Investigation (long-form teardown)* in `system_config.content_corpus` on 2026-08-06; `api/_content.ts` still matches the legacy heading so an older copy keeps resolving. Two-way collision rule: that section must never be retitled to contain "Mindmake's publication" (it precedes section 4 and would capture the `makeyourmindup` lookup), and the weekly Mindmake's publication section must never be titled with "Teardown" or "Investigation" (the format is called *Mindmake's publication: Paid*, so this is now easy to get wrong, and the investigation pattern is tested first) |
| `brand/SKILL.md` | Mindmake brand positioning |
| `google-docs-api/SKILL.md`, `google-sheets-api/SKILL.md`, `google-slides-api/SKILL.md` | Formatting standards for each surface |
| `knowledge-system/SKILL.md` | Where polished output lands in Drive |
| `n8n/SKILL.md` | 3,500+ lines of battle-tested N8N patterns - **mandatory before editing workflow JSON** |
| `supabase-edge/SKILL.md` | Edge function development standards |

---

## 7. The agent operating contract (CLAUDE.md)

Every Claude Code agent session follows the same wake protocol (`/root/.openclaw/CLAUDE.md`).

### 7.1 Session wake, step by step

**Step 0 - Identity resolution.** Determine `MY_AGENT_ID` from `$AGENT_ID` env or `.agent-id` in workspace root. **Hard fail** and write the failure to the agent-reports file if neither resolves. (Was "the agent-reports file"; the OS is pull-only since 2026-09-06.)

**Step 1 - Load Identity (static).**
1. `IDENTITY.md`
2. `ORG.md`
3. `/root/.openclaw/skills/agent-${MY_AGENT_ID}/SKILL.md` (rendered from `agents.brief_content`)

Hard fail if SKILL.md missing → record in agent-reports: "brief not rendered, run `render-identity.py`". (Was a Telegram push; pull-only since 2026-09-06.)

**Step 2 - Load Standards.**
4. `hot/standards-digest.md` (rendered nightly from `standards_registry`)

**Step 3 - Load Plan (dynamic).**
5. Supabase `agent_plans` row for `MY_AGENT_ID` (via `supabase-tools.py`)
6. `active/${MY_AGENT_ID}-action.md` (rendered from the agent's Action Doc)

**Graduated stale handling.** If `agent_plans.last_rendered_at > 72h`, enter READ-ONLY mode - reads/research OK, sends/commits/Supabase-writes blocked. the agent-reports file: "off-sprint, plan render stale ({age})". The `Agatha Weekly Plan Refresh` workflow (Mon 09:00 UTC) keeps every plan inside the 72h window in normal operation.

**Step 3b: Load Krish's portfolio objective.** If `agent_plans.weekly_goal_id` is non-null, load the corresponding `goals` row (the parent portfolio objective) plus any `goal_agent_contributions` rows where `agent_id = MY_AGENT_ID`. Present them in the loaded context as "Krish's portfolio objective you serve: {title} (venture, status, priority, target_horizon). Your contribution: {note}". The agent's own `agent_plans.objective` (from Step 3) is the slice of work the agent contributes to the visible portfolio objective. If `weekly_goal_id` is null, the agent has no portfolio parent yet and acts on its `agent_plans.objective` alone; clusters of unparented tasks should be surfaced to Marcus for objective nomination.

**Step 4 - Memory.**
7. `MEMORY.md` - **only** in direct Krish chats. Never in shared contexts (Discord, group chats).

**Step 5 - Workstream detection.** `detect_workstream(MY_AGENT_ID, first_user_message)` → continue / ask / new.

**Step 5b - concept-decision check (synthesis paths).** For synthesis-oriented agents (Marcus, Vera, Agatha, Priya), before treating a memory-file or warm-report concept reference as live work, query `concept_decisions WHERE concept_id = $1 AND superseded_at IS NULL`. If a `closed` decision is returned, the reference is historical context only. (The automatic synthesis-time JOIN that would enforce this fleet-wide is not yet wired - see §17.7.)

### 7.2 Lexicon discipline

- **Identity** = static. Lives in SKILL.md / IDENTITY.md / ORG.md / `agents.brief_content`. Rare changes.
- **Plan** = dynamic. Lives in `agent_plans` + Action Doc body + `active/${MY_AGENT_ID}-action.md`. Weekly changes.
- **Objective** = durable strategic record. Lives in `goals` (portfolio objectives, multi-week, Krish owns) plus `milestones` (week-sized chunks of an objective). Same lexical tier as Decision: rare, load-bearing, never silently rewritten. NOT a synonym for Plan. Never call a milestone or an objective a "plan."
- **Decision** = durable. Lives in `concept_decisions` keyed by `concept_id`. Captures every closure / kill / pause / reopen Krish makes. Never deleted; reopens supersede rather than overwrite.
- **Banned forever.** "Master Brief," "Tactical Plan," "Action Plan," "Execution Brief."
- New file proposals must declare which side they fall on. No middle ground.

### 7.3 Output gate

Before any output ships:

```python
violations = validate_output(MY_AGENT_ID, output_text, category)
# If violations: fix them. Do not submit.
```

The gate calls `deliver_gate.py` which checks the output against `standards_registry`. Violations get logged to `audit_log`.

### 7.4 Correction loop

When Krish corrects the agent:

```python
log_correction(MY_AGENT_ID, type, instruction, original, corrected)
```

Vera consumes these; new enforceable standards get proposed if a pattern emerges (§9.5).

### 7.5 Session end

```python
update_workstream_context(context_id,
  summary="what was done",
  artifacts=["task-ids", "doc-urls"],
  pending=["what's still waiting"],
  keywords=["key", "terms"],
  entities=["names", "products"])
```

### 7.6 Non-negotiable rules (excerpt from standards-digest.md)

- Zero em dashes anywhere.
- Git author: `hello@krishraja.com` only.
- No publishing without explicit Krish approval.
- No Opus in N8N.
- Read `krish-voice` skill before any outbound content **or email draft**.
- No markdown artifacts in emails - professional HTML.
- Verify before reporting done.
- Log errors before fixing them.
- **Closures are concept-level, not row-level.** When Krish says "we're done with X" in any context, the correct action is `close_concept('concept:org:X-slug', '<reason>', '<actor>')`, not a row-level status PATCH. The cascading-closure path is the only path that produces a durable ledger entry.

### 7.7 Closure-intent translation (Agatha-specific)

When Krish indicates a concept is closed in conversation (Telegram, Discord, Control Center chat), Agatha:

1. Determines the canonical concept slug from the conversational referent (`compute_concept_slug` is available as an SQL helper; for chat-time resolution Agatha may guess `concept:org:<slug>` and confirm against `concept_decisions` or `leads.concept_id`/`tasks.concept_id`).
2. Calls `SELECT close_concept('<slug>', '<one-sentence reason capturing Krish''s phrasing>', 'agatha-via-telegram')`.
3. Acknowledges with the RPC's return payload: "Closed concept `concept:org:X`. Affected: N tasks, M leads."
4. Updates her memory file for the day with the closure note (Krish-facing context, not a row update).

**Banned:** silent acknowledgement that does not call `close_concept`. The old behaviour where Agatha sometimes patched a single row and sometimes wrote a memory note and sometimes did nothing is the bug this architecture fixes. A dedicated Closure Intent Receiver N8N workflow that would make the receiver path durable across Agatha sessions is not yet built (see §17.7); today Agatha calls the live `close_concept` RPC directly.

---
