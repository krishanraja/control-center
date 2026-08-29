# Marcus prompt patch — stop folding empty health-checks into "Top blockers"

**Where this lives:** `agents.brief_content` for `agent_id = 'marcus'` in Supabase
(rendered to `/root/.openclaw/skills/agent-marcus/SKILL.md` by `render-identity.py`).
The N8N workflow that writes `home_intelligence` is `Marcus | mind/make OS | Synthesis + Home Intelligence`.

**Why this patch exists:** Marcus's "Top blockers" synthesis was collapsing empty
system-health rows into action items. The Control Center Today tab was
surfacing strings like:

> Health alert: 0 down, 0 stale // 2026-05-19

…as if they were tasks Krish needed to act on. They are not — they're the
*absence* of alerts. Defence in depth is in place (Control Center filters
`/Health alert:\s*0\s*down,\s*0\s*stale/i` from both task titles and the
Marcus body), but the source-side fix lives here.

---

## Drop-in addition to Marcus's brief_content / synthesis prompt

Add the following block near the top of the "Composition rules for
`home_intelligence.summary` and `home_intelligence.assessment`" section:

```markdown
## Blocker selection

When composing the "Top blockers" sentence in summary.body, include ONLY items
that meet all of these:

1. They are real outstanding work — i.e. tasks with status ∈
   {active, waiting, in_progress, new} AND updated_at within the last 14 days
   AND owner = 'krish' (or an agent currently blocked on Krish).
2. They are NOT system-health pulses. Reject any row whose title or body
   matches /^health alert/i, /sync engine running/i, /heartbeat/i, or any
   "0 down, 0 stale" pattern.
3. They contain a concrete next move that a human can take in <5 minutes
   (open doc, send reply, approve draft). Vague "review waiting items" is
   not a blocker — it's a category.

If no item meets all three, write "No blockers. Krish has clear runway." —
do NOT pad the sentence with system-health pulses to reach a count.

## Top 3 actions rule (v2 schema)

When populating `top_3_actions`, the same selection rules apply. Each action
MUST carry an owner that is an agent_id and a status from the enum
{blocked, at_risk, on_track, in_progress, waiting, ahead, done}. Do not
emit actions whose owner = 'system' or whose title starts with "Health".
```

## How to apply

1. Open Supabase SQL Editor (or the Agatha workspace `update-agent-brief.py`
   script if you use it).
2. Fetch the current brief: `select brief_content from agents where id = 'marcus';`
3. Insert the block above into the appropriate section.
4. Save. The next `render-identity.py` cron tick (≤15 min) will propagate
   to `/root/.openclaw/skills/agent-marcus/SKILL.md`.
5. The next Marcus Home Intelligence Brief cron (Mon/Wed/Fri 4:30PM UTC) will
   write a cleaned `home_intelligence.summary` row.

## Verification

After Marcus's next run:

```sql
select (summary::jsonb)->>'body' from home_intelligence where id = 'current';
```

Should not contain "Health alert: 0 down, 0 stale". If it does, raise the
specificity of rule 2 above (add more reject patterns).
