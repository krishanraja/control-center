# Cleo / Agatha bot intent patch — capture content ideas from Telegram chats

**Where this lives:** `agents.brief_content` for `agent_id = 'cleo'` and
`agent_id = 'agatha'` in Supabase. Both agents already handle inbound
Telegram messages — this patch tells them to recognise content-idea seeds
and forward them to the unified ingest webhook.

**Why:** the user wants ideas captured wherever they're surfaced. The
floating ⌘+I modal in the Control Center is one entry point; Cleo and
Agatha Telegram bots are the other (and probably more frequent) ones.

---

## Drop-in addition to Cleo's brief_content

Append under "Inbound message handling":

```markdown
## Content idea capture

When Krish sends a message that either:

(a) starts with `idea:` or `Idea:` or `IDEA:` or `💡` (case-insensitive
    on the prefix), OR
(b) you classify as a "content seed" — a thesis, observation, or framing
    Krish wants captured for later (confidence ≥ 0.7) —

…then BEFORE responding conversationally, POST to the idea-capture webhook:

```
POST https://krishraja10101.app.n8n.cloud/webhook/idea-capture
Headers: X-Agatha-Secret: <env.AGATHA_WEBHOOK_SECRET>
Body: {
  "source_type": "cleo_chat",
  "source_ref": "<telegram_message_id>",
  "source_url": "<telegram deep link, if available>",
  "source_snippet": "<the message body>",
  "raw_text": "<the message body>",
  "captured_at": "<ISO timestamp>"
}
```

Then reply to Krish with:
> ✨ Captured. It'll land in your Content lane in a few seconds.

If extraction confidence is low, still capture — Cleo will enrich it later.
NEVER drop a seed silently.

If the message also asks for an action ("draft this for LinkedIn"),
continue with the normal drafting flow AFTER capture.
```

## Drop-in addition to Agatha's brief_content

Identical to the above, except:

```diff
- "source_type": "cleo_chat",
+ "source_type": "agatha_chat",
```

Agatha-routed ideas tend to be more strategic / business-shaped; Cleo-routed
are more brand-voice / creator-shaped. The provenance pill in the UI shows
which conversation it came from.

## How to apply

1. Fetch current brief: `select brief_content from agents where id = 'cleo';`
2. Append the block above.
3. Same for `agent_id = 'agatha'` (with the source_type change).
4. `render-identity.py` propagates the change within 15 min.

## Verification

Send Telegram:
> idea: writing about why fractional executives are eating the consulting market

```sql
select idea, thesis, source_type, source_ref, created_at
from content_ideas
where source_type in ('cleo_chat','agatha_chat')
order by created_at desc
limit 5;
```

Should show the row within ~5s of the message landing.
