# Runbook — exact replayable commands

Paste-and-run. If something doesn't work as documented, fix the runbook first, then proceed.

## Access

- **Live URL:** https://controlcenter.krishraja.com
- **Access code:** `gosell` (edge gate, Vercel env `ACCESS_CODE`, SHA-256 cookie `cc_access`, 30-day MAX_AGE).
- **Local dev:** `cd C:\Users\krish\control-center; npm run dev` → http://localhost:5173 (no gate).
- **Supabase project (Mindmaker OS SSOT):** `gojpffsrxybbpbdzzrvs`. Anon key in `src/lib/supabase.ts` (build-time `VITE_SUPABASE_ANON_KEY`).

## Test viewports

| Mode | Device | Width | Height | Use |
|---|---|---|---|---|
| Mobile triage | iPhone 14 | 390 | 844 | Triage deck, swipe behavior, fast-iterate |
| Mobile fallback | iPhone X | 375 | 812 | Smaller-mobile sanity |
| Desktop deep-work | MacBook 14 | 1440 | 900 | Composer, board view, multi-select |
| Wide desktop | Full HD | 1920 | 1080 | Edge case (lane widths) |

In Cursor's IDE browser, set viewport via CDP:
```js
// 390 x 844 mobile
Emulation.setDeviceMetricsOverride { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, scale: 1 }
// 1440 x 900 desktop
Emulation.setDeviceMetricsOverride { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, scale: 1 }
```

## Inner scroll on the Content tab

The Content tab owns its own scrolling section (the `AppFrame` body). `window.scroll(...)` does NOT scroll the page — you must scroll the inner section.

```js
// Scroll the Content tab's inner section
(()=>{
  const s = document.querySelector('section.flex-1.min-h-0.overflow-y-auto') ||
            document.querySelector('[data-content-scroll]') ||
            document.scrollingElement;
  s.scrollTo({ top: 0, behavior: 'instant' });
})()
```

## Detect horizontal scroll (regression test for C-3)

```js
(()=>{
  const r = { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth, h_scroll_on_root: false };
  r.h_scroll_on_root = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  r.offenders = Array.from(document.querySelectorAll('*'))
    .filter(el => { const cs = getComputedStyle(el);
      return (cs.overflowX === 'auto' || cs.overflowX === 'scroll')
        && el.scrollWidth > el.clientWidth + 5; })
    .slice(0, 12)
    .map(el => ({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,80), sw: el.scrollWidth, cw: el.clientWidth }));
  return r;
})()
```

## Inspect a single content idea via the React app's Supabase client

There is no `GET /api/content-ideas/:id`. Use the anon Supabase client directly (RLS allows anon SELECT):

```js
(async()=>{
  const sb = (window).__SB__ || null; // not exposed; use the URL + key from the JS bundle if needed.
  // Alternative: copy supabase URL + anon key from src/lib/supabase.ts and run:
  const url = 'https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/content_ideas?id=eq.ed8cf84c-6fe2-459e-8d86-834969923a38&select=id,state,quality_score,lane,length:body,updated_at';
  const r = await fetch(url, { headers: { apikey: window.__ANON__, Authorization: `Bearer ${window.__ANON__}` }});
  return await r.json();
})()
```

If `__ANON__` isn't set, read the anon key from the deployed JS bundle (`view-source:` → search `eyJ...`) or from `src/lib/supabase.ts` locally.

## API contracts to keep passing

| Route | Method | Body keys | Returns |
|---|---|---|---|
| `/api/content-ideas` | POST | `raw_text`, `source_type`, `source_ref`, optional `source_url` | `{ ok, id, idea }` |
| `/api/content-ideas/:id` | PATCH | any subset of `idea`, `thesis`, `distribution`, `body`, `state`, `lane`, `pillar_id`, `scheduled_for` | `{ ok, idea }` |
| `/api/content-ideas/:id/revise` | POST | `axis: 'punchier'\|'contrarian'\|'warmer'\|'formal'\|'short'\|'mid'\|'full'\|'zoom'`, optional `selection`, optional `notes` | `{ ok, preview, rev_id }` |
| `/api/content-ideas/:id/challenge` | POST | `mode: 'challenge'\|'counter'\|'hook'\|'sources'` | `{ ok, challenge, refs }` |
| `/api/content-ideas/:id/score` | POST | optional `model` | `{ ok, standards, quality_score }` |
| `/api/content-ideas/:id/dive-deeper` | POST | `question` | `{ ok, finding }` |
| `/api/content-ideas/:id/transform` | POST | `target_lane` | `{ ok, child_id }` |
| `/api/content-ideas/:id/materials` | GET / POST / DELETE | corpus refs | `{ ok, materials }` |
| `/api/content-ideas/:id/chat` | POST | `message` | `{ ok, reply, transcript }` |
| `/api/content-ideas/:id/save-draft` | POST | optional `target_channel` | `{ ok, doc_url }` and moves piece to `review` |
| `/api/content-seed-candidates` | GET | — | `{ ok, candidates[] }` |
| `/api/triage/relevance-sweep` | POST | `{ table, target, dry }` | `SweepReport` |

## Verify C-1 / C-2 (state-machine cleanliness) via Supabase MCP

```sql
-- Count review-state cards with insufficient body content
select count(*) as bad_review_count
from content_ideas
where state = 'review'
  and coalesce(length(body), 0) < 200
  and buried_at is null;

-- Count drafting cards with neither body nor chat activity
select count(*) as zombie_drafts
from content_ideas
where state = 'drafting'
  and coalesce(length(body), 0) = 0
  and (meta->'cleo_chat' is null or jsonb_array_length(meta->'cleo_chat') = 0)
  and buried_at is null;

-- Distribution sanity
select state, count(*) as n,
       count(*) filter (where coalesce(length(body),0) = 0) as empty_body,
       count(*) filter (where quality_score is null)        as no_score,
       count(*) filter (where lane is null)                 as no_lane
from content_ideas
where buried_at is null and state not in ('dropped','published','absorbed')
group by 1 order by 1;
```

## Reset a single test idea back to seeded (idempotent test fixture)

```sql
update content_ideas
set state = 'seeded', body = null, quality_score = null,
    meta = coalesce(meta, '{}'::jsonb) - 'revisions' - 'challenges' - 'standards' - 'cleo_chat' - 'cleo_pushes' - 'saved_drafts'
where id = 'ed8cf84c-6fe2-459e-8d86-834969923a38';
```

## Useful curls

```bash
# Seed candidates
curl -sS https://controlcenter.krishraja.com/api/content-seed-candidates | jq '.candidates | length'

# Patch an idea's body (server sanitizes em dashes)
curl -sS -X PATCH https://controlcenter.krishraja.com/api/content-ideas/<id> \
  -H 'content-type: application/json' \
  -d '{"body":"test body \u2014 with em dash should be stripped"}' | jq .
```

## Trip-wire: the "is the app actually serving the rebuild?" check

```js
// On any deployed build, the rebuild banner / version pill (TBD in PLAN.md P-0)
// should be present. Until P-0 ships, this is a no-op.
document.querySelector('[data-rebuild-version]')?.textContent
```
