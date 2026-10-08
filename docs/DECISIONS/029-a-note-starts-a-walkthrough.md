# ADR-029: A note starts a walkthrough on his Claude subscription

- Status: Accepted
- Date: 2026-10-08
- Deciders: Krish

## Context

On 2026-10-07 and 2026-10-08 a Claude Code session ran the week's battle plan
(`docs/plans/2026-10-07-week-battle-plan.md`) with him: one step at a time,
"done, skip or help?" on each, drafting the pieces (an advisory candidate list,
a launch post, Heartside bios and a sample order list). Krish, 2026-10-08:

> "Whenever I give a long ramble into control centre about what I want to get
> done, it's probably best that it triggers something in this session ...
> I'd rather walk through what I actually need on each piece with you like
> this and have options to choose from, and then have you draft it from the
> Claude subscription (as opposed to from the API control centre). Can you
> make that work, bulletproof, robust, and antifragile?"

The same session also showed a failure: he answered "Done" to five steps and
meant "I expect Control Center to help me do this". Nothing had been done.

## Decision

1. **Every kept note read starts one walkthrough, plus a button.** When
   `api/strategist.ts` saves a note read, it fires a Claude Code routine
   (`api/_walkthrough.ts`) after `done`, so the read never waits. The routine
   runs on his Claude subscription, not the API. Every note read also shows a
   card (`WalkthroughCard`) with the session link, or a retry and the prompt
   to paste by hand. Krish chose "every note, plus a button" on 2026-10-08.
2. **Only the read id crosses the wire.** The session reads the note and the
   read from Supabase itself. The fire payload is `read_id: <uuid>`.
3. **One session per read.** The routine endpoint has no idempotency key and
   starts a new session on every call. `walkthrough_runs.read_id` is unique
   and is claimed before the call; the button retries only a failed or stale
   claim, through a conditional update.
4. **The playbook lives in the repository**, at
   `.claude/skills/walkthrough/SKILL.md`, so every session runs the same
   version and a correction to it is a reviewed commit.
5. **Outcomes are honest.** `walkthrough_steps.outcome` is one of
   `done_together`, `did_it`, `drafted`, `later`, `dropped`. Only the first two
   mean done. The walkthrough never offers a bare "Done".

## Consequences

- Migration `20261008090000` was applied to production on 2026-10-08 and read back: both tables exist, row-level security is on, service role only, and anon and authenticated cannot read them.

- He needs to create the routine once at claude.ai/code/routines (repository
  control-center, Supabase connector on, prompt: run the walkthrough skill for
  the read id in the payload), generate its API token, and set
  `CLAUDE_WALKTHROUGH_ROUTINE_ID` and `CLAUDE_WALKTHROUGH_ROUTINE_TOKEN` in
  Vercel. Until then every read offers the copyable prompt.
- Routines are a research preview and the fire endpoint is marked experimental
  (docs read 2026-10-08). If its shape changes, `parseFireResponse` fails
  closed and the card falls back to the prompt; nothing he said is lost.
- Limits: 30 fires per routine per hour, 100 per account. A burst of notes past
  that leaves rows marked `rate_limited` that the button can retry.
- `scripts/check-walkthrough-handoff.mts` (CI) holds decisions 2 to 5.
