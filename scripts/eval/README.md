# Prompt eval harness

An A/B harness for the prompts this codebase sends to a model, built so
"measurably better" can be an actual number rather than an impression.

```bash
# read the prompts an arm actually sends, calling nothing
npx tsx scripts/eval/run.mts revise --dry --cases 1

# measure, with the noise-floor control arm
npx tsx scripts/eval/run.mts revise --cases 24 --repeats 2 --null

# re-read a finished run — free, and reruns the current analysis over saved samples
npx tsx scripts/eval/report.mts scripts/eval/reports/revise-<stamp>.json
```

Credentials come from `.env.production.local` / `.env.local`, the same files
`scripts/run-endpoint.mts` reads. `vercel env pull` writes the first one.

## Why the design looks like this

An LLM graded by an LLM is a noisy instrument, and the noise is large relative
to the effects people claim for prompt changes. Three things keep a run honest:

**Paired.** Every arm sees the identical case set, and the statistic is the
per-case difference. Content varies enormously in how well it scores, and that
variance dwarfs any prompt effect, so comparing arm averages across different
cases would drown the signal.

**Repeated.** Each case runs `--repeats` times per arm and the repeats are
averaged before anything is compared, so one lucky sample cannot stand in for a
case.

**Null-controlled.** `--null` enters the baseline a second time under a
different name. The two arms are the same prompt, so the difference between them
is pure instrument noise. That number is printed as the noise floor, and any
result smaller than it is reported as inconclusive rather than as a direction.
Without it a report cannot tell a finding from a coin flip.

The interval is a bootstrap over **cases**, not samples: two runs of one case
are not two pieces of independent evidence, and resampling them as though they
were produces a flattering interval that is wrong.

## Reading a report

```
  arm          n    mean    sd     p50 ms    p95 ms    $
  bare        16  3.100  0.200      9074     13202  0.1817
```

`mean` is the metric. `$` is measured, not estimated: `callClaude` takes an
optional `onUsage` callback and the harness prices real token counts.

```
  llm-brief
    delta +0.133 · 95% CI [-0.400, 0.800] · win/loss/tie 1/1/1 · sign p=1.0000
    cost +$0.0174 · median latency +10346ms
    INCONCLUSIVE — the 95% interval contains zero
```

A verdict is only `BETTER`/`WORSE` when the interval excludes zero **and** the
effect clears the noise floor. Cost and latency sit next to the score on
purpose: an arm that wins by 0.1 and adds ten seconds has not won.

`BY SLICE` breaks the delta out by subgroup. An overall result near zero can be
two slices cancelling, and that is a different finding from no effect.

## Judge diagnostics

Every report checks whether the score is tracking output **length** rather than
quality, and if it is (|r| >= 0.3), repeats the whole comparison on scores
residualised on log(length) so no arm can win by writing more.

This is on by default because it has already changed a conclusion. On the first
real run of the `revise` suite the candidate arm looked +0.100 ahead; its briefs
were fuller, so its rewrites were about 20% longer, and the Five Standards judge
correlates with length at r≈0.57. Residualised, the same comparison was +0.002.
Without the check the harness would have recommended shipping a change that does
nothing.

Length is worth checking by default because almost every prompt edit moves
output length as a side effect, and almost every rubric that rewards depth or
evidence rewards length along with it.

## What a run cannot tell you

The judge is a model applying a written rubric, not the person whose voice is at
stake. It measures conformance to a bar. Treat a win as permission to try
something in the product behind a flag, never as proof it is better.

Match the judge to the question. The Five Standards rubric grades whether a
finished piece is good. It is the wrong instrument for asking whether a rewrite
did what it was told, because a steer like "cut at least a third" produces a
shorter piece that a depth-rewarding rubric marks down for obeying. Comparisons
between arms on the same steer stay fair; a comparison of one steer against
another does not.

Reports land in `scripts/eval/reports/` with every sample's raw output, so a
surprising number can be read back rather than re-run.

## Adding a suite

Implement `Suite` from `_types.mts` and register it in `run.mts`. The important
discipline is that a suite should call the **same prompt builder the product
calls** — `_revisePrompt.ts`, `_finalPass.ts`, `_humor.ts`, `_ladder.ts` — never
a copy. A suite that measures its own transcription of a prompt measures the
transcription.

Suites live next to what they measure:

| suite | surface | metric |
|---|---|---|
| `revise` | `api/content-ideas/[id]/revise.ts` | Five Standards mean (`api/_standards.ts`) |
