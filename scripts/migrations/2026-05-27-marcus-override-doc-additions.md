# Phase 0 doc additions for MINDMAKER_OS_ARCHITECTURE.md

These were split out of the `feat/marcus-override-capture` PR because the
architecture doc was already being edited by the in-flight Cleo Inspiration
Pipeline work landing the same day (2026-05-27).

After the Cleo Pipeline commit ships, paste the two blocks below into
`docs/MINDMAKER_OS_ARCHITECTURE.md`, repeat for the VPS mirror
(`/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md`) and the Drive
mirror (Infrastructure folder, file ID `1y4dncntB8WsKgLjTzC-YZ3KgWXyfwIt5`),
then delete this file.

---

## Block 1: new subsection §8.7.1

Insert immediately after the current §8.7 closing line:

> `**The promise: same mistake doesn't survive four occurrences.** FeedbackButton surfaces: \`tasks\`, \`leads\`, \`guests\`, \`visibility_targets\`, \`content_ideas\`.`

and before the line:

> `### 8.8 Self-healing ...`

Paste:

```markdown
### 8.7.1 Marcus top_three override capture (Phase 0)

The `FeedbackButton` thumbs-down is the lightweight rejection signal. For Marcus's daily `top_three` picks on the Home tab, there is also a higher-effort signal: the swap affordance.

```
Krish hits the Replace icon on a top_three card
    -> optional textarea: "What would you have picked instead?"
        -> POST /api/feedback with shape:
            { source_table: 'home_intelligence',
              source_id: '<slot index, 0/1/2>',
              agent_id: 'marcus',
              vote: -1,
              reason_code: 'marcus_priority_override',
              reason_text: '<Krish replacement, or null>',
              meta: { original_pick_title, original_pick_meta,
                      replaced_with_text, captured_at } }
            -> feedback_queue row

Marcus | Daily Brief 06:30 (next tick)
    -> Pull live data node fetches feedback_queue rows where
      reason_code='marcus_priority_override' AND created_at >= now() - 14d
    -> Sonnet 4.6 prompt receives the RECENT OVERRIDES block plus the
      Krish-overrides interpretation rules (system prompt)
    -> top_three is reranked using the override pattern, if any

In parallel, the standard 8.7 self-improvement loop still applies:
    -> Vera Feedback Aggregation (Sun 06:00 UTC) groups
      marcus_priority_override rows with 3+ matches
        -> corrections row with proposed_brief_edit
            -> Agatha surfaces, Krish approves
                -> Persistent edit to agents.brief_content for marcus
```

The swap is intentionally higher-friction than the thumbs-down: it asks Krish to articulate what he would have picked, which is the signal Marcus needs to learn the pattern. The thumbs-down is "this was bad"; the swap is "this was wrong AND here is what was right."

Carrier file: `scripts/n8n/marcus-daily-brief.workflow.json` (live workflow id `d2sHSeyXMmu8Xe0C`). The Pull live data node grows a 12th parallel fetch from `feedback_queue` (idempotent: `.catch(() => [])` on transport failure). The Sonnet brief system prompt grows a Krish-overrides paragraph; the user content appends the RECENT OVERRIDES JSON.
```

---

## Block 2: new row in §22.4 Phase 2 open items table

Append a new row to the existing table:

```markdown
| P2-8 | Marcus override-capture burn-in. Phase 0 of focus brief landed 2026-05-27 (feedback_queue.meta column, swap affordance on top_three cards, Daily Brief workflow loads 14d of overrides). Watch `feedback_queue` row count where `reason_code='marcus_priority_override'`, plus Marcus's accept-as-is rate. Re-evaluate at day 14 (2026-06-10). Gate Phase 1 (Daily Focus Picker) on Krish's explicit green light after that. | 14 days |
```
