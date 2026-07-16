# Spec: `Maya | Frame A/B Sweep` — test, learn, promote winners

Weekly cron (Mon 16:00 UTC). The learning half of the test-and-learn loop:
frames are the test unit, this sweep is the judge, and the promotion lands as
a `sequence_approval` decision for Krish — never auto-applied.

## Step 1 — deterministic winner detection (SQL, no LLM in the math)

```sql
-- per lane: current frame vs challengers, minimum 30 sent per arm
select lane, frame_version, sent, leads_touched, paid,
       paid::numeric / nullif(leads_touched, 0) as conversion
from frame_conversion
where sent >= 30
order by lane, conversion desc nulls last;
```

A challenger "wins" when: `sent >= 30` on BOTH arms AND challenger conversion
> incumbent conversion × 1.25 (25% relative lift — coarse on purpose; with
these volumes anything finer is noise).

## Step 2 — voice-conformant proposal (LLM writes rationale ONLY)

For each winner, read the lane's `venture_registry.voice_profile` and insert:

```
POST /rest/v1/acquisition_sequences
{
  "lane": "<lane>",
  "name": "Promote <winner> over <incumbent>",
  "sequence_type": "frame_promotion",
  "frame_version": "<winner>",
  "touches": <winner's touch copy, from the existing sends>,
  "rationale": "<Claude Haiku: 2 sentences citing the actual conversion numbers,
                 written in the lane's voice_profile. No invented stats.>",
  "proposed_by": "maya",
  "status": "proposed"
}
```

That row surfaces automatically as a `sequence_approval` card in
decisions_waiting (v4 view) and deep-links to the Growth tab. On approve,
the Nurture Scheduler switches new sends to the winning `frame_version`.

## Step 3 — log the learning

Insert a `learning_events` row (event_type='win', classification='win_pattern')
so Vera's Friday aggregation sees frame wins alongside everything else.

## Guardrails

- Never more than ONE open `frame_promotion` proposal per lane (check before
  insert) — no proposal spam.
- The sweep only reads `frame_conversion` and writes `acquisition_sequences`
  + `learning_events`. It never touches sends directly.
- Cost: one Haiku call per winner (rare) ≈ $0.001. The math is free SQL.
