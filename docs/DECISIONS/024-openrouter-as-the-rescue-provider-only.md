# ADR-024: OpenRouter is the rescue provider, and only the rescue provider

- **Status:** Accepted
- **Date:** 2026-09-24

## Context

Anthropic was unavailable to this OS three times in one month:

| Date | Failure |
|---|---|
| 2026-09-15 | dead key, 401 on every call |
| 2026-09-20 | spend cap reached |
| 2026-09-23 | org usage limit, eight-day lockout to 2026-10-01 |

Not one was a model failure. All three were billing or limit events on a single
account. That is the fact the decision turns on, because it says what a fix has
to be: a second billing relationship, not a second model.

Until now the OS had two half-answers to this, neither of which provided one.
The Vercel functions fell back to OpenAI inside `callClaude`, which was well
built — a breaker keyed off the provider's own stated reset time, bulk-path
opt-outs, a daily call cap — but covered only one of four transports. The n8n
fleet fell back to Gemini through eleven hand-written branches, nine of which
were broken from the day they were written, on a free-tier Google key where
every pro model carries a quota of zero.

The question put to this decision was broader: should the OS route everything
through OpenRouter?

## Decision

**Direct Anthropic stays the primary path. OpenRouter is the rescue path, on
every transport, standing in like-for-like.**

## Why not the primary path

Three objections were raised and two of them did not survive measurement. That
is recorded here rather than quietly dropped, because the surviving objection is
much narrower than the one first argued and a future reader deserves the real
reason.

Probed against the live credential on 2026-09-24, total spend $0.052:

| Claim | Result |
|---|---|
| "OpenRouter marks up per-token" | **False.** Anthropic models are list price. `claude-sonnet-5` $2/$10 per 1M, `claude-haiku-4.5` $1/$5. The margin is on credit top-ups. |
| "Prompt caching will not survive the hop" | **False.** An 8,348 token prefix wrote at 1.25x input and read back at 0.1x; a 1h TTL wrote at 2.0x. Those are exactly `CACHE_MULTIPLIERS` in `api/_prices.ts`. |
| "The `thinking` default will bite" | **True, in the safe direction.** Omitting `reasoning` returned `reasoning_tokens: 0` and a complete answer, where the direct API runs adaptive thinking on Sonnet 5. The defaults differ, so the rescue pins `reasoning` explicitly on every call. |

What actually keeps the primary path where it is:

1. **The meter and the guards are built on Anthropic's native response shape.**
   `readUsage()` parses `cache_creation.ephemeral_1h_input_tokens`;
   `check-cache-metering` asserts every `anthropicCall` passes a usage object.
   Moving the primary path means rewriting that read path for every call site,
   for no cost saving.
2. **Cache is per-upstream and does not transfer.** OpenRouter serves
   `anthropic/claude-sonnet-5` from five independent upstreams — Anthropic
   first-party, AWS Bedrock, Azure, Google Vertex. A prefix cached against the
   direct key is not readable by a Bedrock-served call. Excellent for a rescue,
   which runs rarely and wants independence; ruinous for a hot path whose
   economics depend on cache hits.
3. **Feature surface is normalised, and unevenly.** No `anthropic-beta` headers,
   no native thinking blocks, no native tool-use blocks. The Bedrock endpoints
   do not advertise `structured_outputs` while Azure, Vertex and first-party do,
   which is why the rescue does not send `response_format` at all. The OS calls
   are single-shot and multi-turn text today, so this costs nothing now and
   would cost a great deal the day an agent loop is built on it.
4. **Some Anthropic traffic is a flat fee.** The OpenClaw gateway authenticates
   with an OAuth subscription token, not a per-token API key. Routing that
   through OpenRouter would convert a flat fee into metered spend. It does not
   move.

## Why the rescue path, like-for-like

The rescue used to demote to `gpt-5.4-nano` / `gpt-5.4-mini` on the assumption
that standing in with the same model was the expensive option. At list price
with caching intact, that assumption is simply wrong, and the demotion bought
nothing but a worse answer on the one day it ran.

The controls that made the cheap tier safe are the controls that still make it
safe, and they were never the model tier: bulk paths opt out by name
(`enrich-person` alone ran 3,284 calls on 2026-09-15), and a daily call ceiling
applies, counted from the meter.

> **Ruling (Krish, 2026-09-24):** the rescue stands in like-for-like, because a
> fallback that quietly gets worse is a fallback that lies about being up.

This sits against **CFG-COST-001** ("no premium models in background fallback
ladders"), and the tension is deliberate rather than overlooked. CFG-COST-001
was written after a ladder with no cap and no opt-outs absorbed a dead Anthropic
key into premium Gemini for roughly $1,800. The rule's target is an uncapped
ladder on a background cron. What is accepted here is a capped stand-in on
interactive surfaces, with bulk paths still excluded. If the daily ceiling is
ever removed, CFG-COST-001 applies again in full.

## Consequences

**Cost stops being inferred.** OpenRouter returns `usage.cost` per call and
`api/_meter.ts` records that figure. The rescue slugs therefore have no row in
`api/_prices.ts` and `check-anthropic-fallback` now fails if one is added — a
second rate that must agree with an invoice and is edited independently
eventually disagrees, silently, and this repo already paid for that with two
identical price tables.

**One shape adapter replaces eleven.** `asAnthropicResponse` dresses a rescue
answer in Anthropic's native shape inside `api/internal/sonnet-proxy.ts`, so a
workflow never learns a fallback happened and cannot have a broken fallback
parser. This is the structural fix for the nine-of-eleven failure.

**Accepted: one more vendor in the path.** OpenRouter's own availability is now
a dependency of the rescue. Mitigated by it being the rescue rather than the
primary, and by its automatic failover across five upstreams — which is strictly
more independent than the single upstream the primary path has.

**Accepted: a saving of zero is reported on rescue traffic.** `usdUncached` is
left unset, so the cache-saving surface shows no saving even where a cached read
plainly saved money. Computing the counterfactual needs the rate table this
deliberately avoids. Wrong by less than an invented number, and only visible
during an outage.

## What would reverse this

- OpenRouter's availability becoming the thing that fails.
- Anthropic billing staying stable for a full quarter, at which point the second
  relationship is worth re-costing against its complexity.
- An agent loop with native tool use, which the normalised surface serves badly.

## Open, and not resolved by this ADR

**The rescue account is not funded.** Probed 2026-09-24: `is_free_tier` true,
`total_credits` 0, a hard $100 key limit. A rescue with no money is configured
and useless, and fails on the one day it is needed — which is exactly how 23
Gemini fallback nodes sat dead for months behind a free-tier key. Fund it, set
the key limit deliberately, and put its balance on the Spend surface beside
Apify's prepaid line.

**The n8n fleet has not been migrated.** Routing the ~45 direct Anthropic nodes
through the proxy is the step that would delete the eleven Gemini branches. It
is blocked on mirror drift, not on this decision: measured 2026-09-24, 43 of 106
checked-in mirrors match cloud exactly, 14 differ only by injected secrets, and
**49 genuinely differ** — several by thousands of characters of nodes that exist
in cloud and not in the repository, and one where the repository holds 6.5k
characters cloud does not. `AGENTS.md` documents two stale mirrors. Pushing
workflow changes against that would destroy live work, so it waits on a
reconciliation.
