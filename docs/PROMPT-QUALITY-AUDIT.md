# Prompt quality audit

*Scope: every LLM call site in this repository except `compound/`. Roughly 60
call sites across `api/`, `scripts/`, `supabase/functions/`, and the two n8n
workflow trees.*

## The question

> When this tool asks an LLM a question, are the prompts 10 out of 10? I usually
> find it better to ask an AI to rewrite the prompt toward my outcome and then
> use that response as the initial brief. In the content engine I feel like that
> might improve quality measurably.

Short answer: the prompts are not 10/10, but the gap is not where the question
assumes, and the technique is already implemented here in a static form that a
dynamic version has to beat rather than replace.

## Where the prompts are genuinely strong

Compared with typical production LLM code, four things here are well above
average.

**Context injection is real, not decorative.** Almost every generative call is
grounded in context loaded at request time rather than hardcoded: the voice
block and channel corpus from `system_config`, the attached research materials,
the live draft. `corpusForChannel()` (`api/_content.ts`) slices a long corpus
down to the Five Standards plus the one relevant channel playbook plus the
cross-channel rules, so a rewrite for LinkedIn is briefed on LinkedIn rather
than on everything.

**Negative constraints are specific and consistently applied.**
`VOICE_GUARDRAILS` is a named kill-list, not a vague "write well". The
investigation ladder's *"an empty list is a valid and respected answer"*
(`api/_ladder.ts`) directly counters the model's bias toward producing
something, which most prompts never think to do.

**Output is verified in code, not just requested in the prompt.** This is the
standout, and it is rarer than it should be. `channel-cut` tells the model every
number must appear verbatim in the source *and* then checks with
`unsupportedNumbers()`. `shifts/detect` states an evidence-diversity floor *and*
enforces it in `verifyShift()`. Every rung of the investigation ladder is paired
with a deterministic gate in `api/_gates.ts`. Prompts are treated as unreliable,
which is correct.

**Graders are calibrated against grade inflation.** *"Most drafts are a 3 on
unique and kind; reserve 5 for genuinely exceptional"* (`score.ts`). *"If a
signal is absent, 10-30, never invented; 80+ requires explicit evidence"*
(`_icpScore.ts`). Naming the expected distribution is the single most effective
thing you can do to stop an LLM judge marking everything 4/5.

## The five real weaknesses

**1. Worked examples are almost entirely absent — this is the biggest gap.**

Of roughly 60 call sites, exactly one generative prompt shows the model a
before-and-after: `api/_humor.ts`, whose `HUMOUR_GUIDE` carries a definition,
the craft mechanism, a worked example and an avoid-list per register. Its own
code comment records why it exists: *"the generic rewriter does not produce
it."*

That is an experiment that already ran, in this codebase, and won. Examples beat
instructions for style work badly enough to justify a dedicated module and a
stronger model. The lesson was then never generalised to any other voice-shaped
prompt. Style is the thing that is easier to demonstrate than to describe, and
every drafting prompt here describes.

**2. No prompt versioning and, until now, no way to measure.**

`prompt_version` appears once in the entire repository
(`synthesize.ts`, hardcoded `'v1'`). Nothing records which prompt produced which
output. The investigation pipeline logs a `promptSha`, and is alone in that.

This is why the original question cannot be answered from the codebase as it
stood: there was no instrument. That is what `scripts/eval/` now provides.

**3. The prompt layer could not be run offline.** `api/_content.ts` imported
`api/_supabase.ts` at module scope, and that module throws on import when
credentials are absent. Every prompt-building module was downstream of it, so
you could not assemble a system prompt and read it back without a live
database — let alone test one. *Fixed: the config read now imports the client
lazily, since config reads were the only thing in the file that needed it.*

**4. Prompt and model identity drift.** `api/content-ideas/cluster.ts` and
`scripts/clustering/build-narrative-clusters.ts` do the same job with prompt
text that has diverged by a clause. `scripts/n8n/` and `n8n/workflows/` hold two
copies of several workflows with different `max_tokens` for the same node
(visibility enrich: 1024 in one, 3500 in the other). `'claude-sonnet-4-6'` is a
string literal in about twenty files; only `api/_harness.ts` centralises model
identity, and only for the ladder.

**5. A live defect in sampling control.** *Fixed, see below.*

## The defect

`streamClaude()` (`api/_stream.ts`) had no `temperature` parameter and sent
none. Every non-streaming call in the codebase tunes temperature deliberately —
`0` for classifiers, `0.2-0.3` for graders and extractors, `0.4-0.6` for
drafting — while the three streaming surfaces silently ran at the provider
default.

One of those three is `api/content-ideas/[id]/revise.ts`, the most-used
generative surface in the composer. Every "Punchier", "Shorter", "Harder ending"
rewrite ran at a materially higher temperature than its own non-streaming
siblings (`channel-cut` and `synthesize`, both `0.5`) for no reason anyone
chose.

Fixing it surfaced a second, latent problem. `claude-opus-4-8` returns a 400 if
you send `temperature` at all. `api/_harness.ts` knew this and guarded; the
helpers in `_content.ts` did not, and sent `temperature` unconditionally — so
pointing `callClaude()` at an opus model would have 400'd, and the streaming
helper avoided that only by never sending temperature, which is what cost it
sampling control in the first place. The guard is now one exported list
(`NO_SAMPLING_MODELS` / `supportsSampling()`) that all three clients consult.

Revise now runs at `0.5`, matching its siblings. The humour path, which uses
opus, correctly sends nothing.

## On the technique itself

Rewriting a thin instruction into a fuller brief before generating is a sound
technique. It pays when the variable input is thin **and** the surrounding
prompt is thin too, because then the expansion is most of the information the
model gets. Four things make it a weaker lever here than it looks.

**The scaffolding already carries the specificity.** A revise call sends about
1,250 characters of persona, voice reference, channel corpus and kill-list
before the directive is read at all. The marginal information an expanded
directive adds is small next to what is already in the prompt.

**You already do it, by hand.** Every preset chip in
`src/lib/contentEngine.ts` carries a written steer of 20-45 words. "Punchier" is
not sent as "Punchier"; it is sent as *"Compress. Shorter declaratives, harder
verb choices, uneven rhythm. Cut every word that the reader already
understands."* That is an expanded brief. It was written by the person whose
voice is at stake, it costs nothing, it is deterministic, and it is already
shipping. A model-generated brief has to beat that, not beat nothing.

**The free-text path is barely used.** Across 58 drafts with bodies, six have
any revision history at all, and none contain a genuinely typed instruction —
the three that look typed are the hardcoded "Final publish polish" preset. The
surface where expansion would help most is the one that sees the least traffic.

**Its failure mode is dangerous on exactly this kind of surface.** An expander
that invents an objective produces a brief the rewriter cannot distinguish from
a real instruction. On a voice-critical path with a kill-list, "cut the middle"
silently becoming "cut the middle and sharpen the hook" is a worse outcome than
a vague brief. The expander tested below is explicitly forbidden from doing
this, and it remains the main risk.

### Where it would pay

The instinct is right; it is the targets that need choosing. The thin-input
surfaces that steer a whole piece and have no preset path are:

- `synthesize.ts` — `angle_hint`, free text from a modal, steering a full
  synthesis of up to 25 source cards.
- `research-topic.ts` — `angle`, free text, steering a 500-900 word piece.
- `chat.ts` — Cleo chat, genuinely open-ended, no preset path at all.

Worth noting that `research-topic.ts` already runs the sibling technique: it
fans a single topic into three differently-angled research queries before
searching. So does `dive-deeper.ts --suggest`, which has a model design the
research questions before any research runs. The instinct is already in the
codebase; it just has not been applied to drafting.

## The measurement

`scripts/eval/` is an A/B harness for prompts. See its README for the design.
The short version: paired on identical cases, repeated per case, and
null-controlled — the baseline is entered twice under different names so the
difference between two identical prompts gives the harness's own noise floor.
Any effect smaller than that floor is reported as inconclusive rather than as a
direction.

The first suite, `revise`, tests three arms on real drafts pulled from the
database, across the four steers that actually appear in the revision history:

| arm | steer sent |
|---|---|
| `bare` | the chip label alone ("Punchier") — no hand-written hint |
| `hint` | the hand-written preset steer that ships today |
| `llm-brief` | the chip label expanded into a brief by a model call at request time |

That ordering is what makes the result useful. `hint` and `llm-brief` against
`bare` answer whether expansion helps at all. `llm-brief` against `hint` answers
the only question that decides whether there is anything to build.

