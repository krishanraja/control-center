# Cron and scheduling: reference detail

> **Reference detail for section 9 of [`MINDMAKE_OS_ARCHITECTURE.md`](../MINDMAKE_OS_ARCHITECTURE.md).**
> This is the deep text that used to sit inside the architecture doc, moved here on 2026-10-05 so the core
> stays small enough for an agent to load. It was written between May and October 2026 and was not
> re-verified line by line on the move. **The core, its section 0a (the canon) and the live source named in
> the core win over anything below.** Dated notes inside the text are history, not current state.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

## Known stale in this file (checked 2026-10-05)

- Any line describing a Telegram message, push or "ping" to Krish. The OS has been pull-only since 2026-09-06 (core 0a.4).
- Any line describing an agent writing a Google Doc into Drive, or `sync-to-drive.py`, `cc-doc-creator.sh` or `google_drive_sync` as live. All retired 2026-10-05 (core 0a.5).
- The OpenClaw job list in 9.1 is dated. `Hunter - Daily Sourcing`, `product-agent` and `newsletter-draft` were disabled on 2026-10-05; `enterprise-gigs-agent` was retired 2026-07-10. The live list is `openclaw cron list` on the VPS.
- The VPS crontab block in 9.2 lost `sync-to-drive.py`, `cc-doc-creator.sh` and `arlo-daily-contradiction-audit.sh` on 2026-10-05 and gained `openclaw-runs-to-cc.py`. The live list is the root crontab.
- Vercel crons: `vercel.json` is the only list. Several content crons named here moved to `krishanraja/content-engine`.

---

## 9. Cron and scheduling

Four scheduler layers cover different shapes of work.

### 9.1 OpenClaw cron (`/root/.openclaw/cron/jobs.json`) - ~38 jobs

These spawn isolated Claude Code agent sessions. They cost real LLM tokens. Used when the work needs reasoning or context.

| Cadence | Job | What it does |
|---|---|---|
| `30 11 * * 1-5 ET` | oauth-refresh | Google OAuth token rotation |
| `0 9 * * 1-5 ET` | agatha-state-of-union | Daily SOTU written for Control Center (Telegram delivery removed 2026-09-06) |
| `0 9,13,17 * * 1-5 ET` | gmail-monitor | Inbox triage |
| `0 14 * * * ET` | system-health | Infrastructure health pulse |
| `0 3 * * * ET` | context-archiver, workspace_maintenance | Nightly cleanup |
| `0 2 * * * ET` | vera-daily-audit | Light integrity check |
| `0 6 * * 5 ET` | vera-weekly-audit | Friday deep audit |
| `0 10 * * 1-5 ET` | bd-agent | Warm LinkedIn activation |
| `0 11 * * 1-5 ET` | enterprise-gigs-agent | RETIRED 2026-07-10 (Meliora + AdFixus gone) |
| `0 9 * * 1,2,4,5 ET` | visibility-agent | Speaking/podcast outreach |
| `0 7 * * 1 ET` | weekly-synthesis, content-engine-sweep2 | Monday morning content + intel. content-engine-sweep2 is LEGACY: superseded by the Friday Vercel assemble cron (§9.3.1); verify + retire on the next VPS cron pass |
| `30 16 * * 1,3,5 UTC` | Marcus Home Intelligence backstop | Backstop for the N8N synthesis |
| `0 13 * * 1,4 UTC` | Layer 1 Signal Inbox Check | Drain Krish's Drive drop folder |
| Every hour | Arlo, Hourly Feedback Pickup | Sip from feedback_queue |
| `0 9 28-31 * *` | monthly-all-hands | End-of-month executive review |

### 9.2 VPS system crontab - zero AI cost

These run shell scripts and Python that never call an LLM. Cheapest possible cadence.

```cron
*/2  *   * * *   fire-pending-flags.py            # Process pending flags
*/5  *   * * *   cc-sync-engine.sh                # Control Center sync
*/5  *   * * *   poll_sync_queue.py               # Supabase sync queue
#    RETIRED 2026-10-05: cc-doc-creator.sh (per-task Google Docs) and refresh_token.sh + sync-to-drive.py (agent Drive doc mirrors), see 0d
*/15 *   * * *   render-identity.py               # Render agent identities
*/15 *   * * *   openclaw-runs-to-cc.py           # OpenClaw cron runs -> workflow_runs (added 2026-10-05)
0    3   * * *   workspace_maintenance.sh         # arlo-daily-contradiction-audit.sh retired 2026-10-05 (broken script)
0    3   * * 1   vera-contradiction-audit.sh
0    6   * * *   Download Cleo's DRAFTS.md from Google Doc
0    8   * * *   vera-n8n-audit.js
30   2   * * *   regenerate-standards-digest.py + vera-nightly-quality-loop.sh
30   11  * * 5   vera-gap-cycle.sh                # Route weekly Vera audit findings -> tasks + auto-close (§8.8.7)
```

### 9.3 N8N cron (inside each workflow)

N8N workflows carry their own `cron` / `schedule` nodes. **Live count as of 2026-09-07: 123 workflows total, 108 live and 87 active, 15 archived** (verified against the n8n public API, not inferred). Projected steady state is **~5,580 scheduled executions/month** against the 10,000 cap, after the 2026-08-12 cadence retune: `Inbox Return Detector` 15m→1h, `Audience Pipeline` 15m→2h, `Send Dispatcher` 15m→30m (kept responsive because it paces real outbound), `HARO Ingestion` 30m→2h. Left as-is, those four alone were 10,080/mo, i.e. the entire budget for four workflows. See `workflow_runs` for the live cadence and §3.4.1 for execution-budget governance; Kai's Dependency Mapper rolls it up.

Notable scheduled workflows:

| Cadence | Workflow | Role |
|---|---|---|
| Every hour | Deep Enrich Retry Sweep | Picks up `status='new'` leads/guests/visibility, re-fires the appropriate enrich endpoint |
| Every 3 hours | Critical Infrastructure Monitor | Tier 3 self-healing |
| Every 8 hours | Silent Success Detector | Tier 2 self-healing |
| Mon 09:00 UTC | Agatha Weekly Plan Refresh | Refreshes all 14 agent_plans via Sonnet 4.6 |
| Mon 11:00 UTC | Nova Visibility Sweeper | Weekly Perplexity scrape → visibility_targets |
| Sun 06:00 UTC | Vera Feedback Aggregation | Weekly feedback_queue → corrections rollup |
| Sun 07:00 UTC | Vera Failure Pattern Sweep | Tier 4 self-healing |
| Sun 08:00 UTC | Vera Success Induction Sweep | Generative learning: cluster wins into skill_proposals |

**Planned closure workflows (see §17.7).** `Agatha | Closure Intent Receiver` (webhook trigger only - no cron), and a weekly `Vera | Closure Audit` (Sunday, after Failure Pattern Sweep) that would flag any concept re-closed > 2 times in 30 days as a generator-misfire pattern.

### 9.3.1 Vercel crons (Content Engine v2): the fourth scheduler layer

Content Engine v2 (§5.8) schedules through `vercel.json` crons hitting the OS's own `/api/*` functions. Zero n8n execution-budget impact: none of these count against the 10k/mo n8n cap.

| Cadence (UTC) | Path | Role |
|---|---|---|
| Daily 11:30 | `/api/feed/ingest` | CTRL pool → `content_ideas` Feed (news horizon, expires_at) |
| Fri 17:30 | `/api/shifts/detect` | Recurrence-gated shift detection → `shifts` + `shift_evidence` + decisions |
| Fri 18:00 | `/api/briefs/assemble` | Weekly brief drafted-first → `weekly_briefs` `ready` + `brief_review` decision |
| Mon 14:00 | `/api/purge/run` | Hard purge: expire, feed-a-shift, or graduate to Library |

(`vercel.json` also carries pre-existing Vercel crons for triage sweep, idea clustering, and the Monday discover jobs; the four above are the Content Engine v2 set.)

### 9.4 Cost discipline

| Tier | Where | Why |
|---|---|---|
| Free (zero AI) | VPS crontab shell scripts | Always pick this if no reasoning needed |
| Cheap (Haiku, GPT-4.1-nano, DeepSeek Flash) | N8N monitoring + classification | Hourly+ cadence |
| Standard (Sonnet 4.6) | Agent work, drafting, synthesis, code, enrichment, plan refresh, email drafts, closure-intent translation | Per-session use |
| Premium (Opus 4.7) | **Agatha chat only** | Decisions, not background jobs |

---
