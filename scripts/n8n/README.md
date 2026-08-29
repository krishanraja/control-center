# N8N workflows — git is the source of truth

Every workflow that runs mind/make OS lives here as a JSON file. The N8N
Cloud editor is a runtime, not a source. If git and cloud disagree, git wins.

## Layout

```
scripts/n8n/
  *.workflow.json   canonical workflow definitions, one file per workflow
  *.md              prompt/contract patches that don't fit cleanly in JSON
  audit.mjs         compare local files vs cloud, exit 1 on drift
  sync.mjs          push local files to cloud (--plan by default, --apply to commit)
  audit.sh          bash wrapper for audit.mjs
  sync.sh           bash wrapper for sync.mjs
  README.md         this file
```

## The rule

**Edits land in git first.** Open a PR, get review, merge, then run `sync.sh
--apply` to push to cloud. The cloud editor is for triage only.

When a hot-fix has to happen in the cloud editor (production fire, can't wait
for review), the rule is: **export the workflow back to git within 24 hours**
via PR. `audit.sh` will fail CI until parity is restored.

## Commands

All commands need `N8N_API_KEY` in the environment. Default base URL is
`https://krishraja10101.app.n8n.cloud`; override with `N8N_BASE_URL`.

```bash
# Bash / Git Bash / WSL
export N8N_API_KEY=...
./scripts/n8n/audit.sh                     # summary, exits 1 on drift
./scripts/n8n/audit.sh --verbose           # show field-level drift
./scripts/n8n/audit.sh --filter=marcus     # only Marcus workflows
./scripts/n8n/audit.sh --json > audit.json # machine-readable

./scripts/n8n/sync.sh                      # plan only (safe)
./scripts/n8n/sync.sh --apply              # push canonical fields to cloud
./scripts/n8n/sync.sh --apply --create-missing  # also create local-only ones
./scripts/n8n/sync.sh --apply --filter=cleo
```

```powershell
# PowerShell
$env:N8N_API_KEY = "..."
node scripts/n8n/audit.mjs
node scripts/n8n/audit.mjs --verbose
node scripts/n8n/sync.mjs --apply
```

## What the scripts do

`audit.mjs`

1. Lists every `*.workflow.json` in this directory.
2. Lists every workflow in N8N Cloud (paginated).
3. Matches by `name`.
4. Diffs the canonical fields: `name`, `nodes`, `connections`, `settings`,
   `staticData`. (Active state, credentials, version IDs are intentionally
   ignored — they belong to the runtime.)
5. Reports each workflow as `OK`, `DRIFT`, `LOCAL` (only in repo), or `CLOUD`
   (only in cloud). Exit code 1 if anything is off.

`sync.mjs`

1. Reads the same local files.
2. For every local workflow that exists in cloud → `PUT /workflows/:id` with
   the canonical fields. Existing credentials, executions, and active state
   are preserved by N8N.
3. For every local workflow that's *not* in cloud → no-op unless
   `--create-missing` is passed, then `POST /workflows`.
4. Cloud-only workflows are never touched. Use the cloud UI to delete them,
   then re-export anything you actually want to keep.

Reverse direction (cloud → repo) is intentionally manual: open the workflow
in the editor, click `…` → `Download`, drop the file into this directory,
commit. The reason is human review — anything coming back from the editor
should be eyeballed before it becomes canonical.

## CI hook (recommended, not yet wired)

Add to `.github/workflows/n8n-audit.yml`:

```yaml
name: n8n audit
on: [pull_request, push]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: node scripts/n8n/audit.mjs
        env:
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
          N8N_BASE_URL: ${{ secrets.N8N_BASE_URL }}
```

The audit will fail the build if the repo and cloud disagree, forcing the
team to either commit the cloud version or push the repo version.

## Recent additions

- `krish-objective-milestone-proposer.workflow.json` (Phase 3, 2026-05-29). Marcus's milestone proposer for the portfolio-objective layer. Webhook at `/webhook/propose-milestones` accepts `{ goal_id }`; daily Schedule at 06:00 UTC picks the first eligible active objective with no proposed milestones. Sonnet 4.6 proposes 2 to 5 milestones grounded in Marcus's live brief; idempotency via a pre-insert race check on `milestones.status='proposed'`. Audit log event: `objective_milestone_proposer`. Live workflow id: `uL8DLpHbT11eqBAW`.
  - **Phase 6 enrichment (2026-06-01, PR #111), pending re-import.** The webhook now also accepts `mode` (`propose`|`recalibrate`) and `krish_context` (Krish's narration). In `recalibrate` mode it drops stale `proposed` milestones first; the Sonnet prompt is grounded in `goal_agent_contributions` and now emits `owner_split`, `is_accomplishment`, and `auto_executable_pct` per milestone. This workflow has `availableInMCP=false`, so the canonical JSON was edited directly here and must be **re-imported to n8n Cloud** to take effect (the cron stays backward-compatible until then).
- **Ladder-down is NOT an n8n workflow.** Committing a week (`POST /api/weekly-focus/commit`) spawns one task per contributing agent for each committed milestone, implemented inline in the Vercel route with the service-role client (deterministic, idempotent, no inlined secret). Kept out of n8n on purpose — it is a pure DB fan-out that needs no LLM and no separate runtime.

## Known limitations

- Webhook URLs in the canonical JSON include the cloud tenant
  (`krishraja10101.app.n8n.cloud`). Forking the workspace requires a
  search-and-replace.
- `staticData` can drift on schedule-triggered workflows because N8N writes
  internal state into it. The audit treats this as drift; in practice, prefer
  pushing the repo version unless you know the cloud `staticData` is load-bearing.
- Credentials are referenced by ID. Moving between tenants will break those
  references; re-bind them in the editor after the first sync.
