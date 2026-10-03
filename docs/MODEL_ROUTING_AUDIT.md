# Model routing audit

Audited 2026-09-12 against repository commit
`cbe8b9bda736879bdb0bd80c8a7ed875ad653c2f` and the 108 canonical workflow
mirrors in `scripts/n8n/`.

## What the fleet should use

| Task class | Default | Why |
|---|---|---|
| Validation, formatting, dedupe, thresholds | No model | Deterministic code is cheaper, faster and reproducible. |
| Classification, extraction, ranking, short schema output | Claude Haiku 4.5 or GPT-5.4 nano | High-volume, bounded judgment. Pick the provider already used by the route. |
| Human-facing drafting, synthesis, cross-record business judgment | Claude Sonnet 5 | Best default quality/cost tier. Disable thinking for bounded JSON and drafting; use adaptive thinking only where an eval proves it helps. |
| Deep current-web research | Perplexity Sonar Pro | Use only when the query is genuinely multi-step. Use Sonar for quick factual probes and connection checks. |
| Provider fallback for drafting | GPT-5.4 mini or Gemini Flash | A fallback must preserve the same schema and be tested on the same eval set as primary. |
| Long-horizon agentic investigation | Claude Opus 5 | Exception-only. No scheduled n8n task currently justifies this tier. |
| A decision read that needs a second opinion (today's move) | Claude Sonnet 5, challenged by GPT-6.1 Sol from another lab | The challenge is where the cross-check earns its keep. Fable was weighed for it on 2026-10-03 and ruled not worth the cost ([ADR-028](./DECISIONS/028-the-daily-move-and-the-cheap-lane.md)); a bigger decider only on evidence from his verdicts. |

Claude account-plan usage and Claude API usage are separate billing systems.
Deployed Vercel functions and n8n Cloud workflows still need provider API keys;
changing the model route reduces API cost but does not consume a Claude web or
Claude Code subscription allowance.

## Changes made in this audit

| Route | Before | Now | Reason |
|---|---|---|---|
| Inbox Classifier | Sonnet 4.6 | Haiku 4.5 | One constrained routing object; this is a classifier, not synthesis. |
| Focus Calibrator | Sonnet 4.6 | Sonnet 5, thinking disabled | Cross-table business relevance benefits from Sonnet; explicit thinking prevents answer-token starvation. |
| Task Lever Rater | Opus 5, 16k output | Sonnet 5, thinking disabled, 2k output | At most 20 short rows; the previous tier and cap were disproportionate. |
| Cleo idea capture | GPT-5 nano | GPT-5.4 nano | Structured extraction/ranking task. |
| Zara Drive watcher | deprecated GPT-4.1 nano | GPT-5.4 nano | Structured extraction/ranking; removed the sampling override. |
| Omnichannel emergency fallback | GPT-4o | GPT-5.4 mini | Bounded drafting fallback at a materially lower per-token price. |
| Goal Gate default | GPT-4o | GPT-5.4 nano | Bounded rubric judgment and JSON output; `OPENAI_JUDGE_MODEL` is the task override. |
| Skill Forge default | GPT-4o | GPT-5.4 mini | Full structured generation; `OPENAI_SKILL_MODEL` is the task override. |
| Marcus synthesis telemetry | Generic `claude-sonnet` fallback and stale Gemini pricing | Exact Sonnet 4.6 fallback and current Gemini 2.5 Flash token rates | Prevents an unpriced model label and material spend under-reporting. |

`npm run check:model-routing` enforces these assignments, blocks GPT-4.1 nano,
GPT-4o and Opus 5 from active n8n workflows, verifies proxy authentication, and
prints the active model inventory.

> **Correction, 2026-09-24. The table above records changes that were made in
> the REPOSITORY and never deployed.** Four of them were still running the old
> route in production twelve days later: Task Lever Rater on `claude-opus-5` at
> 16k (on a two-hourly cron), Omnichannel emergency fallback on `gpt-4o`, Zara
> Drive watcher on `gpt-4.1-nano`, and Hunter Job Sweep on `gemini-2.0-flash`,
> which Google shut down on 2026-06-01.
>
> The guard could not see it. It asserts against the checked-in mirrors, the
> mirrors were correct, and nothing in the repository read the runtime. It was
> also not wired into CI at all until 2026-09-24 — it existed only as an npm
> script while twenty other guards ran on every push.
>
> Both halves are now closed. `check-model-routing.mts` runs in CI, and
> `check-model-routing-live.mts` asserts the same policy table against the live
> n8n API. They share one table (`scripts/modelRoutePolicy.mts`) so the runtime
> half cannot go stale on its own. A third bug surfaced while wiring it: the
> shared model regex could never match `gpt-4o`, because alternation is
> first-match and the numeric branch came first, so the `forbiddenActive` entry
> for it had been dead since it was written.
>
> A route is not deployed until the runtime says so. Item 2 below said as much
> and is the reason this went unmeasured.
>
> **Deployed 2026-09-24.** All four are now live, applied through the n8n public
> API as a per-node edit rather than `sync.mjs --apply`, because a whole-workflow
> push would have stripped `settings` keys the pusher denylists and rewound
> `zara-layer-1`'s Google Drive cursor from 2026-09-16 back to the mirror's
> 2026-09-02, re-ingesting two weeks of files. Each write fetched the live
> document, changed one node, and echoed everything else back unchanged; each was
> then read back and asserted on node count, every other node's parameters,
> `settings`, `staticData`, `credentials`, every `webhookId`, and `active` state.
>
> | Workflow | Was | Now | Rollback versionId |
> |---|---|---|---|
> | `sonnet-task-lever-rater` | opus-5, 16000 | sonnet-5, 2000, thinking disabled | `c1118178-8941-486e-a5fe-1b9ee62db6b9` |
> | `cleo-omnichannel-content-factory` | gpt-4o | gpt-5.4-mini | `707b20a1-72a3-4c6d-bddb-98363425c30d` |
> | `zara-layer-1-signal-inbox-drive-watcher` | gpt-4.1-nano + temperature 0.2 | gpt-5.4-nano, no sampling override | `1a42a4c0-b85f-414e-81e9-d986c549fd2e` |
> | `hunter-job-sweep` | models/gemini-2.0-flash | models/gemini-3.6-flash | `bc59b72e-91db-41e4-be4a-a92cdca829fa` |
>
> `check-model-routing-live.mts` went from 20 findings to 3, and none of the 3 is
> one of these. Two notes on what was NOT proven. The Zara temperature removal
> was applied as part of the same write because the GPT-5 class rejects a
> non-default sampling parameter, so swapping the model alone would have risked a
> 400 per run; that is the reading of "removed the sampling override" above, not
> a separate decision. And `sonnet-task-lever-rater` has not yet been observed
> executing its LLM node on the new route: its last twenty runs all fetched zero
> unrated rows, so the node does not fire. The parameters are verified, the
> prompt is byte-identical, and historical output measured 56 tokens against the
> new 2000 cap, but a live `stop_reason: end_turn` on the new body remains
> inferred rather than checked.
>
> The three findings that remain are separate: `cleo-content-idea-capture` runs
> `gpt-5-nano` against a mirror expecting `gpt-5.4-nano` and had its OpenAI node
> replaced with a Claude one in the UI, which contradicts the row above and is a
> decision rather than a push; and `cleo-synthesis-engine`'s MIRROR names the
> retired `gemini-2.5-pro` in a telemetry label while the runtime has moved off
> it, so that one is a repository fix. `scripts/check-model-prices.mts` now scans
workflow JSON as well as TypeScript, so an unpriced Anthropic model cannot hide
inside n8n.

## Migration queue, not a bulk replacement

Twenty-seven active workflow files still call Sonnet 4.6. They cover proposal
review, weekly synthesis, content drafting, outreach, guest briefing, PR and
reflection. Sonnet 5 is a likely quality/cost upgrade, but it is not a safe
literal swap:

- adaptive thinking is on by default;
- non-default `temperature`, `top_p` and `top_k` return HTTP 400;
- its tokenizer produces roughly 30% more tokens for the same input;
- `max_tokens` covers thinking plus the visible answer.

For each route, assemble at least 30 representative historical inputs and score
schema validity, factuality, voice/decision usefulness, latency, input/output
tokens and cost. Move a route only when Sonnet 5 meets the current quality floor
and improves cost or latency. For bounded JSON and drafting, start with
`thinking: { type: 'disabled' }` and no sampling parameters. For the strategic
Marcus briefs, retain adaptive thinking and budget visible answer tokens
separately.

Gemini 2.5 Flash/Pro appears in ten workflow mirrors, primarily as fallback.
Keep it until the same fallback eval proves a replacement preserves schema and
quality. A fallback that has not been exercised is not resilience.

## Rollout order for the proxy security change

The previous proxy accepted any four-character `X-Internal-Caller` value, so an
internet caller could spend the server's Anthropic balance. The code now fails
closed on `Authorization: Bearer $N8N_PROXY_SECRET` and keeps
`X-Internal-Caller` only for attribution.

To avoid interrupting the two callers:

1. Generate a new high-entropy `N8N_PROXY_SECRET`; set the same value in the
   n8n sync environment and Vercel.
2. Sync the Focus Calibrator and Inbox Classifier workflow mirrors while the
   old Vercel route is still deployed.
3. Deploy the repository change, then run one test execution of each workflow.
4. Confirm a 2xx response, a parsed result, and a metered Anthropic row for each
   caller. Confirm an unauthenticated POST returns 401.

Do not paste the secret into workflow JSON. The placeholder resolver injects it
only during sync and the audit redactor removes it before comparison.

## 2026-10-03: the daily move and the cheap lane

Decided in [ADR-028](./DECISIONS/028-the-daily-move-and-the-cheap-lane.md).
These are Vercel routes, not n8n mirrors, so `scripts/modelRoutePolicy.mts`
holds them in `API_ROUTES` and `check-model-routing` (CI) asserts them.

| Route | Before | Now | Reason |
|---|---|---|---|
| Person enrichment judgment (`api/_personEnrich.ts`) | Sonnet 5 on every call, no rescue | Sonnet 5 still serves, and shadow-measures GPT-6 Luna, DeepSeek V4 Flash and Haiku 4.5 through OpenRouter on the same evidence | Bulk, bounded judgment. An offline replay could not tell a good model from a poor one, so the lane moves only on live agreement with Claude, measured against Claude's agreement with itself, and goes back to shadow on drift. |
| Today's move, decider (`api/_dailyMove.ts`) | none | Claude Sonnet 5 with adaptive thinking, high effort to write, medium to weigh an objection | The next best action is the decision the day turns on. Fable was priced at $8 to $20 a month against $2 to $3 here, with no evidence it picks better; the value is pinned in the policy. |
| Today's move, challenger | none | GPT-6.1 Sol through OpenRouter, reasoning high, `data_collection: "deny"` | A second lab argues the strongest case against the first move. The decider weighs it only when the challenger prefers another move. |
| Today's move, route (`api/strategist/daily.ts`) | none | Hourly cron, writes from 05:00 operator time, `maxDuration` 300 | Up to three calls in series, inside one deadline. |

Measured before deploy: the dry run's token counts, which price a Sonnet 5 read
and its challenge at about $0.07 a day. Not yet measured: the live figure, and
any cheap-lane agreement, because neither has been called live from this
repository.

## 2026-10-03: cost audit fixes in n8n

Krish asked whether every paid part of Control Center is cost efficient. Read
from 30 days of `meter_daily` and every call site: recurring spend is about $75
a month (the Hunter job sweeps on Apify $46, n8n about $21, `event-score` about
$4.60, which now caches its system prompt), with one-off enrichment backfills on
top. The n8n changes below were made live as approved hot-fixes and exported
back to the mirrors in the same pull request, per `scripts/n8n/README.md`.

| Workflow | What was wrong | Change | Proof |
|---|---|---|---|
| Content Lane Sourcing | Every run since 2026-09-20 paid for three drafts and saved none. Sonnet 5 thinks when `thinking` is omitted, so `content[0]` was a thinking block; with that fixed, one draft carrying raw newlines failed `JSON.parse` and took the good drafts down with it | `thinking: {type: 'disabled'}` on Sonnet Draft; a Repair Draft JSON step escapes control characters inside strings only | Execution 44827: three drafts in `content_ideas`, heartbeat `planned:3 due:3` |
| RE Dossier Engine | Re-picked a name-only contact every 6 hours (`heat_score.desc` puts nulls first), Gmail's empty output stopped the chain before Sonnet, and both Sonnet passes ran on a dead key with `neverError`, so an auth failure could be written as a dossier | Contacts with an email, LinkedIn or company only, nulls last; Gmail always outputs; both passes on `Anthropic account`, and a non-2xx stops the run | Execution 44830: five dossiers, both passes parsed. Test run 44828 had written five research-only dossiers on the dead key; they were cleared and the contacts put back in the queue |
| Visibility Sweeper | The research text was pasted raw into a JSON template, the prompt said today was 2026-06-02, both Extract steps used a dead key, and Filter New and both audit logs read row `[0]` of a one-item-per-row output | Escaped interpolation and a live date; both Extract steps on `Anthropic account`; every row read | Executions 44836 and 44837: 15 new targets, including the Product lane's first 2, each with its audit row |
| Inspiration Sweep | Twice daily; 1 of 68 seeds progressed in 30 days | The 18:00 UTC trigger disabled; 06:00 stays | Version diff: one node changed |
| HARO Ingestion | 367 runs; `haro_queries` has never held a row | Unpublished | `active: false` |

Left as found, each for a stated reason:

- **Newsletter Sweep stays on.** It is a sub-workflow that Agatha's Content
  Angle Approval and Zara's Content Pipeline call with no error handling, and
  it spends nothing on any API.
- **Marcus Daily Brief's model step is unchanged.** The n8n Anthropic node has
  no thinking or effort option, so lowering its thinking means replacing the
  step. Its inline keys are gone (next section).
- **Task Lever Rater is unchanged.** MCP access is off for it; about $0.06 a month.
- **The Sweeper's retry lane** (`Explode Unenriched`) has the same row-`[0]`
  bug, which is why Visibility Deep Enrich never ran from it and 101 targets are
  unenriched. Fixing it would start paid enrichment of mostly stale targets.
- **Three of the four n8n Anthropic credentials are dead.** `Anthropic Header`,
  `Anthropic x-api-key (TOOLS.md) 2026-07-07` and `Anthropic Header 2026-05-21`
  all return `authentication_error` (the last proved by Visibility Deep Enrich,
  executions 44838 to 44842). Only `Anthropic account` works, and every n8n node
  that billed in the 30 days uses it. Eleven workflows called Claude through a
  dead credential. Eight are repointed (next section); three are not, because
  MCP access is off for them.

## 2026-10-03: the dead keys repointed, the brief's keys moved to credentials

Krish approved both the same evening: "sort all of that now, move those keys
in to N8N credentials themselves". Both were made live and exported back to
the mirrors in the same pull request.

**Eight Claude steps moved onto the live credential.** Each now authenticates
with `Anthropic account` (`predefinedCredentialType`, `anthropicApi`), and
n8n's own version diff for each shows that change and nothing else. Two of
them had no authentication mode at all, so they sent no key whatever
credential was attached. The old dead binding stays attached and unused, as
it is live.

| Workflow | Step | Was |
|---|---|---|
| Agatha Lead Deep Enrich | Sonnet Enrich | `httpHeaderAuth` as the credential type |
| Cleo Content Transform | Sonnet transform | `httpHeaderAuth` as the credential type |
| Cleo Email Draft | Sonnet Compose | `httpHeaderAuth` as the credential type |
| Nova Visibility Deep Enrich | Sonnet Enrich | `httpHeaderAuth` as the credential type |
| Nell Guest Speaker Briefing | Sonnet Synthesise Briefing | generic header auth |
| Vera Success Induction Sweep | Draft Skills (Sonnet) | generic header auth |
| Nell Guest Confirmed Cascade | Anthropic: Draft Promos | no authentication |
| Nell Guest Sheet Bulk Import | Anthropic: Extract Guests | no authentication |

Proof: Visibility Deep Enrich execution 44844 ran Sonnet Enrich to `end_turn`
with a full dossier (1,503 output tokens) and stamped the target's
`deep_enriched_at`, where executions 44838 to 44842 had failed with
`authentication_error`. The other three on a dead credential (Guest Pitch
Draft, Guest Pitch Enrich (Exa) and the inactive Objective Milestone Proposer)
have MCP access off, so they are the same change made in the editor, or after
"Available in MCP" is switched on for them.

**The Daily Brief holds no key.** Its "Pull live data" Code node made fifteen
REST calls with the service-role key written into its source, because n8n's
task-runner sandbox cannot read a credential. `public.daily_brief_inputs()`
(migration `20261003200000_the_brief_reads_through_a_credential.sql`) returns
all fifteen reads in one call. A new "Fetch brief inputs" HTTP node calls it
over `Supabase OS (service_role, verified)`, and the Code node keeps only the
arithmetic, stopping the run if a section is missing rather than handing the
model an empty list. The disabled "Telegram push" node, which carried the OPS
bot token in its URL, is removed: the OS has been pull-only since 2026-09-06.

Proof before publishing: the function returned what that morning's inline-key
run read (execution 44789), the same rows in the same order with
byte-identical timestamps, and the draft's test run (execution 44847) wrote
the brief to `home_intelligence` at 19:02:34 UTC with three picks, three
alternates and the same momentum. Published as version `2c199351`. The mirror
carries no placeholder now.

One read changed on purpose. The closed-bets query asked for `bets.outcome`,
`bets.closed_at` and the status `killed`. The table has never had any of them,
so the query failed on every run and the model was handed an empty "Closed bets
(30d)". The function reads what that label says, bets won or lost in the last
30 days. The only closed bet is from May, so the brief reads the same today.

**The exposure is not closed by this.** The same service-role key is inline in
28 other active workflows (item 4 below), and the brief's earlier versions
still hold it in n8n's version history. Rotating the key today breaks all 28.
The OPS bot token now appears in no workflow.

## 2026-10-03: item 4, the admin key moved, and Telegram retired

Krish, the same evening: "do 4, and ensure telegram is not a risk to my
system (i sometimes get my bots hacked, and i use telegram for nothing any
more)". He switched "Available in MCP" on for the three workflows still on a
dead Anthropic credential first, and they moved the same way as the eight
above: Guest Pitch Draft (`b73b9938`), Guest Pitch Enrich (Exa) (`b84fe61a`)
and the inactive Objective Milestone Proposer (draft `a35925c2`, not
published).

**22 of the 28 no longer hold the service-role key.** Each was rebuilt on
the brief's pattern where a Code node needed it: the request moves to an
HTTP Request node on `Supabase OS (service_role, verified)`, node names that
later steps read through `$('Name')` are kept, and the Code node keeps only
the logic. Before any publish, the old and new code ran side by side in a
local harness on synthetic data. Every test in n8n pinned the model, email
and heartbeat steps, and made real requests only where they could write
nothing: an id that does not exist, a column PostgREST refuses, an empty
insert, or a filter that matches no row. Each live definition was then read
back and scanned for secrets before its mirror was synced. "Was" is the
version to restore.

| Workflow | What changed | Proof | Was, now |
|---|---|---|---|
| System Status Board API | run log over the credential | 44852, row read back | `590c4729`, `cd70c8c6` |
| Cleo Draft Post on Demand, Cleo LinkedIn Distribution, Nell Draft Outbound Messages, System Monthly All Hands, System Orchestrator, System Product Proposal to GitHub Issue, Cleo Log Content Performance | the same run-log node; bot token stripped where present | the Status Board run | in the mirrors' history |
| System Control Center Live Sync | run log over the credential; it now answers after the write | the Status Board run | `c41af932`, `de6036d3` |
| Agatha Content Angle Approval | run log over the credential; keys blanked in its disabled sender | clean read-back | `6382c670`, `ec368981` |
| Vera Behavioural Auditor | keys blanked in its disabled audit step | clean read-back | `6f4bbf7d`, `49d23e05` |
| Zara Content Pipeline | reads and one batched task insert over the credential | 44855, full chain | `3cd28c71`, `b017d8d6` |
| Krish Inbox Classifier | reads and writes over the credential | 44857 to 44859 | `6a42d7e5`, `4a406ae8` |
| Krish Inbox Return Detector | one read per table, one PATCH per change | 44860, 44861 | `57cdfbb4`, `a24494eb` |
| Krish Inbox Router | read, insert and PATCH over the credential | 44862 to 44864 | `0dad1fa9`, `adea4e04` |
| System Cost Advisor | two reads, one PATCH per row | 44866, 99 real runs read | `e1245f28`, `c852c4f5` |
| Acquisition CTRL Nurture Scheduler | the planner split into one request per step | harness on every branch; 44867, 44868 | `5b0c0a32`, `8541ce2f` |
| Marcus Synthesis + Home Intelligence | 14 reads as one parallel step; writes in three stages | harness on 5 cases; 44870 to 44872 | `2a2ee10e`, `f007b734` |
| Maya Closed-Loop Revenue Engine | the Comp and Earned reads behind guards | harness; 44875, 44876 | `b08a3fd2`, `b4025237` |
| Nell Guest Scout | rows built in code, one insert per table, outcomes recorded by the same-named node | harness on 4 cases; 44877 | `d9b9b7ac`, `17738fbe` |
| System Proposal Executor | switched off, keys blanked (below) | clean read-back | `c6257ce6`, unpublished |
| System Stripe Reconciliation | six Supabase nodes onto the credential, draft only | 44878 | `fc1a4929`, draft `1b6cc32d` |

Stripe Reconciliation was listed as active in the count above because its
mirror said so. It is inactive in n8n, so its edit is a draft and stays
unpublished; the mirror now says `active: false`.

**Still holding the key.** Six active workflows have MCP access off, so this
session could not edit them: Acquisition CTRL Capture Intake, Acquisition
CTRL Unsubscribe, Krish Focus Calibrator, Stripe Revenue Intake, System
Status Update Receiver and Zara GEO Citation Sweep. Four inactive ones keep it
inside Code nodes: Acquisition Send Dispatcher, Objective Milestone Proposer,
Nell Apollo Contact Enrichment and Hunter Job Sweep (Hunter is left alone on
purpose). Rotation kills their copies; each needs the same rebuild before it
is switched back on. n8n's version history keeps the old key for every
workflow in this section, which only rotation reaches.

**Rotation order.** (1) Switch on "Available in MCP" for the six, so they
move. (2) Rotate the service-role key. (3) The same hour, put the new value
in the n8n credential and in Vercel's `SUPABASE_SERVICE_ROLE_KEY`, and in
anything outside these two that still holds the old one. (4) Read back one
Daily Brief run and one Status Board run.

**Other secrets the rebuild found inline,** left for their own pass: the
proxy secret in the Inbox Classifier, an email-sending key in the Nurture
Scheduler, a GitHub token in Product Proposal to GitHub Issue, and an n8n
admin key in the Proposal Executor's history. The last one should be revoked
in n8n whatever else happens.

**Webhooks, found on the way.** All 31 webhooks in active workflows report
no credential on the webhook node, so any check of the caller happens inside
the workflow, if at all. Anyone who learns a path can start an LLM run, a
database write or a draft. Not changed here; it needs its own pass,
workflow by workflow.

**The Proposal Executor was a way in, and it is closed.** The 2026-09-09
migration left `workflow_proposals` writable by the anonymous key, which
ships in the browser by design, on every column. Anyone could rewrite a
pending proposal's `proposed_changes` and `current_workflow_id`, approve it,
and call the executor's open webhook, which applied it to n8n with an admin
key: a stranger could rewrite any workflow, including the ones holding the
Supabase, Anthropic and Gmail credentials. Ruling (Krish, 2026-10-03): switch
the executor off and lock the table. The executor is unpublished with its
keys blanked, and `20261003210000_proposals_browser_can_only_decide.sql`
holds the browser to `status`, `approved_by`, `approved_at` and `updated_at`,
moving a proposal from proposed or pending to approved or rejected only.
Proved as anon in a rolled-back block: approving is allowed, writing
`proposed_changes` or `current_workflow_id` is refused. It had applied
nothing since 2026-08-29.

**Telegram.** Nothing in n8n or this app listens to Telegram any more, and
nothing sends to it:

- Every Telegram node in the 108 workflow mirrors (106 current, the two
  retired Priya workflows in `scripts/n8n/_retired/`) is disabled, and none
  is a trigger. Live n8n agrees: the trigger list of all 73 active
  workflows MCP can read holds no Telegram trigger. The seven it cannot
  read are the six named in the next section plus Task Lever Rater.
- The one inbound Telegram callback, System Krish Approval Callback, is
  unpublished. It took approvals from any caller.
- Bot tokens were blanked wherever this rebuild touched one. 14 active and
  10 inactive workflows still carry one, each in a disabled node. Revoking
  the bots at BotFather kills every copy at once, including n8n's history, so
  they are left for that.
- The app has been pull-only since 2026-09-06. The connections sweep no
  longer probes the bot, `TELEGRAM_*` is gone from `.env.example`, and
  `20261003220000_telegram_is_retired.sql` records the registry row as
  inactive. Four lines of copy that still promised a Telegram ping are
  corrected.

The live Telegram surface left is OpenClaw on the VPS, which this session
cannot reach. `openclaw.json` binds eight bot accounts to Claude Code agents
that take instructions in chat (section 3.3 of the architecture doc), so a
hijacked bot there reaches an agent with tools, not a disabled node. Removing
those bindings, or allowlisting chat ids for any bot that stays, is the step
that closes it.

## Remaining measurable work

1. Provide `N8N_API_KEY` through the managed local environment, then run
   `node scripts/n8n/audit.mjs` to prove cloud parity and active state. Never
   paste the key into chat or a tracked file.
2. Add call-level telemetry to direct n8n provider nodes: workflow/node,
   provider, model, prompt version, latency, input/output/cache tokens, cost,
   fallback used and downstream acceptance. Most direct Anthropic calls bypass
   the metered proxy today, so model optimisation cannot yet be verified from
   spend data.
3. Run the 27-route Sonnet migration queue in cohorts: classifiers/extractors,
   drafting, synthesis, then high-stakes strategic briefs. Do not combine all
   model changes in one deploy.
4. Replace inline workflow secrets with n8n credentials, then rotate.
   Placeholder injection prevents git leaks but still materialises secrets
   inside cloud workflow definitions. As of the evening of 2026-10-03, 22 of
   the 28 workflows that held the Supabase service-role key no longer do
   (section above). Six active ones wait on "Available in MCP" being switched
   on: Acquisition CTRL Capture Intake, Acquisition CTRL Unsubscribe, Krish
   Focus Calibrator, Stripe Revenue Intake, System Status Update Receiver and
   Zara GEO Citation Sweep. Then rotate in the order given above. Telegram
   tokens are left for revocation at BotFather rather than editing.

Official selection references: [Anthropic model comparison](https://platform.claude.com/docs/en/models/overview),
[Sonnet 5 migration changes](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5),
[OpenAI GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano),
[OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), and
[Perplexity Sonar Pro](https://docs.perplexity.ai/docs/sonar/models/sonar-pro).
