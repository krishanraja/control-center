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
4. Replace inline workflow secrets with n8n credentials. Placeholder injection
   prevents git leaks but still materialises secrets inside cloud workflow
   definitions; credential bindings reduce the blast radius and simplify
   rotation.

Official selection references: [Anthropic model comparison](https://platform.claude.com/docs/en/models/overview),
[Sonnet 5 migration changes](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5),
[OpenAI GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano),
[OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), and
[Perplexity Sonar Pro](https://docs.perplexity.ai/docs/sonar/models/sonar-pro).
