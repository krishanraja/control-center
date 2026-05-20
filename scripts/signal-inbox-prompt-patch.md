# Layer 1 Signal Inbox prompt patch — emit content ideas alongside signals

**Where this lives:** the prompt template for the Layer 1 Signal Inbox
cron (`Layer 1 Signal Inbox`, Mon/Thu 1PM UTC), per the Mindmaker OS
architecture doc §4.4.

**Why:** when Krish drops a doc into the Drive Signal Inbox folder
(`1zspGabjdCcVTs037EsgnmPHTix9UOMsJ`), the cron extracts signals to
`zara_signals`. It does NOT currently extract content ideas. The user
explicitly wants Signal Inbox to be one of the five sources feeding the
new `content_ideas` inbox.

This patch is additive: signals still go to `zara_signals`; we also
extract a `content_ideas` row when the document has a content seed in it.

---

## Drop-in addition to the Layer 1 Signal Inbox prompt

Append after the existing "Extract signals" section:

```markdown
## Also extract content ideas

If the document contains a clear seed for a content piece (a thesis, an
unpublished observation, a piece of writing Krish has started, a quote
worth riffing on), emit ONE additional JSON object per content seed:

```json
{
  "content_idea": {
    "idea": "Headline-style framing of the seed (one sentence).",
    "thesis": "Why this is interesting / true / useful right now (1-2 sentences).",
    "distribution": ["linkedin", "newsletter", "signal-noise-pod"],
    "source_snippet": "The exact text from the document that triggered this idea.",
    "confidence": 0.75
  }
}
```

Then POST it to the idea-capture webhook:

```
POST https://krishraja10101.app.n8n.cloud/webhook/idea-capture
Headers: X-Agatha-Secret: <env.AGATHA_WEBHOOK_SECRET>
Body: {
  "source_type": "signal_inbox",
  "source_ref": "<drive_file_id>",
  "source_url": "<drive_web_view_link>",
  "source_snippet": "<from above>",
  "raw_text": "<the chunk you extracted from>",
  "captured_at": "<ISO timestamp>"
}
```

Rules:
- One idea per distinct seed. If the doc has 3 essays in it, emit 3 ideas.
- distribution must be a subset of {linkedin, newsletter, signal-noise-pod, builder-economy-pod, techonomic, x}.
- If confidence < 0.4, still emit — Cleo will triage. Don't drop seeds silently.
```

## How to apply

1. Open the cron template at
   `/root/.openclaw/workspace/active/templates/layer-1-signal-inbox.md`
   (or wherever the Layer 1 Signal Inbox cron reads its template).
2. Append the section above to the prompt.
3. The cron next runs Monday or Thursday 1PM UTC.

## Verification

```sql
select id, idea, source_type, source_url
from content_ideas
where source_type = 'signal_inbox'
order by created_at desc
limit 10;
```

Should populate after the next Layer 1 cron run, assuming the drops
contain content seeds. Cross-check by counting `zara_signals` rows
with the same `source_ref` — every doc that produces a signal should
also (usually) produce 0-1 content ideas.
