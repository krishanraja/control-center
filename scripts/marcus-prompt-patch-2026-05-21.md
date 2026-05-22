# Marcus prompt patch — structured external_signals (2026-05-21)

**Target:** the brief_content for the `marcus` row in `agents`
(populates the Marcus synthesis prompt loaded by the N8N workflow
`Marcus | Mindmaker OS | Synthesis + Home Intelligence`, id `TI1ozQbPtI69qlgO`).

## Why

Today `home_intelligence.external_signals[]` looks like:

```json
[
  {
    "signal": "AI Engineer World's Fair proposal deadline is May 30, 11 days out. …",
    "source": "Nova task queue",
    "relevance": "…",
    "recommended_action": "…"
  }
]
```

— prose only. No URL, no event id, no urgency level, no days-until field.
The Control Center has no slot to render a tappable CTA, an urgency chip,
or a deadline countdown.

The Control Center has now been extended (PR `claude/visibility-fix-podchaser-nova`)
to consume these additional keys when present:

| Key            | Type                                              | Notes |
| -------------- | ------------------------------------------------- | ----- |
| `source_url`   | string \| null — clickable back-link              | Renders an "Open source" / "Open" tap-out on every signal card. |
| `event_id`     | string \| null — uuid from nova_target_conferences OR podchaser_podcasts | Lets the UI deep-link to the rich event card. |
| `urgency`      | `'critical' \| 'high' \| 'medium' \| 'low'` \| null | Renders a colored dot + chip (red / amber / violet). |
| `days_until`   | number \| null — integer days; negative = past   | Renders a `Nd` countdown chip next to the urgency. |

JSONB is schemaless — no Supabase migration. We just need Marcus to emit
the additional keys.

## Patch — append to Marcus's brief_content

Append this section to `agents.brief_content` for `id = 'marcus'`:

````markdown
## external_signals[] — structured output (2026-05-21)

When you produce `home_intelligence.external_signals[]`, each entry MUST
include the following keys in addition to the existing `signal`, `source`,
`relevance`, `recommended_action`:

- `source_url`: the URL most useful to Krish if he taps the card. For a
  conference signal, this is the CFP page; for a podcast, the listen URL;
  for a market trend, the article you cited. If none applies, set to null.
- `event_id`: if the signal is about a row in `nova_target_conferences`
  or `podchaser_podcasts`, set this to that row's `id` (uuid). Otherwise
  null. Look up the id by joining on `name` (conferences) or `title`
  (podcasts) when Nova has already enriched the row. When unsure, null.
- `urgency`: one of `"critical"`, `"high"`, `"medium"`, `"low"`. Rule of
  thumb:
  - `critical` — a hard deadline within 7 days OR a financial / brand
    risk that's already firing.
  - `high` — a deadline within 30 days OR a measurable lead Krish is on
    track to lose if no action this week.
  - `medium` — a deadline within 90 days OR a strategic theme to invest
    in over the coming month.
  - `low` — context-only; no action gated on it.
- `days_until`: an integer count of days from today until the deadline /
  event date / decision point. Negative if past. Null if the signal has
  no deadline.

**Example shape:**

```json
{
  "signal": "AI Engineer World's Fair proposal deadline is May 30",
  "source": "Nova task queue",
  "source_url": "https://www.ai.engineer/worldsfair",
  "event_id": "5b3c8a9d-aaaa-4321-bbbb-1234567890ab",
  "urgency": "high",
  "days_until": 11,
  "relevance": "Mindmaker sells AI literacy to senior leaders. This stage puts Krish in front of the exact buyer profile.",
  "recommended_action": "Agatha unblocks Nova on this proposal today."
}
```

If you cannot determine one of `source_url`, `event_id`, `urgency`, or
`days_until`, emit `null` — do not omit the key. The Control Center renders
gracefully when keys are null.
````

## Verification

After applying the patch to `agents.brief_content`, manually trigger the
synthesis workflow:

```bash
curl -X POST \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "https://krishraja10101.app.n8n.cloud/api/v1/workflows/TI1ozQbPtI69qlgO/execute"
```

Then confirm:

```sql
SELECT id, external_signals
  FROM home_intelligence
 WHERE id = 'current';
```

Every `external_signals[]` entry should now carry the four new keys (some
may be null, that's expected). The Control Center → Intel tab (mobile)
and Home → "What needs you" section (desktop) will start rendering
urgency chips, day countdowns, and an "Open source" link on every card.
