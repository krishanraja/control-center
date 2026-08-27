# n8n mirror drift: Marcus Synthesis + Home Intelligence

**Status:** blocked on reconciliation. One prompt upgrade is designed and not
deployed. Everything else in the 2026-08-27 pass shipped and was verified.

## What happened

The four Marcus prompt upgrades were to be deployed to the live tenant. Three
were: Daily Brief, Friday Retro, Monday Pre-mortem. The fourth, Synthesis +
Home Intelligence (`TI1ozQbPtI69qlgO`), was stopped before deploy because the
checked-in mirror and the live workflow have diverged, and the live one is
ahead.

Deploying `scripts/n8n/marcus-synthesis-home-intelligence.workflow.json` as it
stands would have **regressed production**:

| | live cloud (updated 2026-08-12) | repo mirror (committed 2026-08-20) |
|---|---|---|
| em dashes in the Build Prompt | 0 | **4** |
| `[RETIRED 2026-08-11: Plinth was renamed Legibility…]` note | present | **absent** |

No em dashes is one of Krish's hard style rules and the prompt enforces it on
the model's own output. Pushing the mirror would have put four of them back
into the instructions, and deleted a note recording a product rename.

The dates say the mirror is newer, which is exactly why mtime and commit order
are not parity evidence: someone edited this workflow in the n8n UI after the
mirror was last committed, and the export was never round-tripped back to git.

## What was reverted

The mirror was restored to its pre-session state. Three changes were prepared
against the stale base and are NOT in the repo any more; they are recorded here
so the work is not lost:

1. **`insights[]` gains a required `action` field.** This is the headline gap:
   the prompt says "Insights must be specific and actionable. Summaries are a
   failure", and the schema does not back it. Every sibling field carries an
   action already — `home_external_signals` has `recommended_action`,
   `home_customer_voice` has `recommended_response`, `home_metrics` has
   `interpretation` — while the three headline insights are bare strings, so
   they render as a bulleted read with no verb in it.

2. **Model to `claude-sonnet-5`, thinking explicit, budget raised** to
   8000/4000 from 3500/1200. Required, not optional: on that model family
   omitting the `thinking` field means adaptive thinking RUNS and spends
   max_tokens before writing. At 3500 it would return a thinking block and no
   text, from a 200 response. This was observed live on the Friday Retro.

3. The Gemini fallback sets `temperature: 0.6` while the Anthropic primary sets
   none, so the two paths behind one UI have different output distributions.
   `model_used` is already recorded on the row, so the provenance exists.

## The client side IS shipped and is forward-compatible

`src/hooks/useMarcusSynthesis.ts` `readInsights()` normalises **both** shapes —
plain strings (every row written so far) and `{insight, action}` objects — and
`MarcusReadSheet` renders the action under the insight when present. Nothing
breaks either way, and the surface lights up the moment the schema lands.

## Doing it properly, in order

1. **Reconcile first.** Export the live workflow to the mirror
   (`node scripts/n8n/sync.mjs` pull, or the n8n UI export), commit that as its
   own change with no edits mixed in, and confirm `node scripts/n8n/audit.mjs
   --filter=marcus-synthesis` reports zero drift. Never patch on top of
   unacknowledged drift.
2. **Then apply the model + thinking + budget change**, deploy, and verify one
   execution returns `stop_reason: end_turn` with a parsed `home_summary`.
3. **Then the `insights[]` shape**, which is the invasive one. It is a data
   shape with **three consumers inside the same workflow**, all of which must
   change in the same deploy or they will render `[object Object]`:
   - `Write to Supabase` — `assessment: d.insights.join(' | ')`
   - `Telegram Notify` — `($json.insights || []).map(function(x, i) { return (i+1) + '. ' + x; })`
   - `Write to Supabase` — the Agatha task `description`, same `.map` shape
   Verify with a manual run **with `Telegram Notify` disabled**, then re-enable.

## The general lesson

Three of the ten scrubbed workflow mirrors were also found to differ from their
live counterparts during this pass. `scripts/n8n/secrets.mjs` now makes the
audit loop usable on scrubbed files (resolve before PUT, redact the cloud copy
before diff), so `audit.mjs` is worth running on the whole fleet and
reconciling before the next deploy of anything.
