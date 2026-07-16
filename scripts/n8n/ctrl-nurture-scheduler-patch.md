# Patch spec: `Acquisition | CTRL Nurture Scheduler` — autonomy-aware sampling

Apply to the live CTRL Nurture Scheduler (daily 14:00 UTC) in n8n. Two changes,
both in the queueing step that INSERTs `acquisition_sends` rows.

## 1. Set `sample_required` from the lane's autonomy level

Before the INSERT, fetch the lane's level once per run:

```
GET https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/venture_registry?slug=eq.mm_ctrl&select=autonomy_level
```

Then per queued send:

| Lane level | sample_required |
|---|---|
| `L1` | `true` for every send (current behaviour — every send approved) |
| `L2` | `true` for a deterministic 1-in-10: `parseInt(md5(lead_id).slice(0, 8), 16) % 10 === 0` — deterministic per lead, so re-runs sample the same rows (idempotency-safe) |
| `L3` | `false` (exception-only; failures/bounces still surface via the dispatcher) |

Code-node snippet:

```js
const crypto = require('crypto');
const level = $('Fetch lane level').first().json[0]?.autonomy_level || 'L1';
const bucket = (leadId) => parseInt(crypto.createHash('md5').update(String(leadId)).digest('hex').slice(0, 8), 16) % 10;
const sampleRequired = (leadId) =>
  level === 'L1' ? true :
  level === 'L2' ? bucket(leadId) === 0 :
  false;
// include { sample_required: sampleRequired(row.lead_id) } in the INSERT body
```

## 2. Route the approval to the ledger, not a task

- Keep inserting `acquisition_sends` with `status='queued'`.
- **Stop creating the `send-{id}` task row.** Queued sends now surface as
  `send_sample` cards in `decisions_waiting` (v4 view) and in the Growth tab's
  Send Approval Deck; approvals POST `/api/acquisition/sends` which flips
  status and pings `/webhook/acquisition-send-dispatch`.
- Transitional safety: while the task INSERT still exists, the v4 view's
  task-branch exclusion hides those tasks whenever their send is queued, so
  nothing double-surfaces. Remove the task INSERT at the next scheduler edit.

## 3. Skip queueing when the lane is paused (Profit Governor)

Before queueing, read the breaker state:

```
GET https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/system_config?key=eq.acquisition_paused_lanes&select=value
```

If `value.mm_ctrl` exists (the lane is paused), end the run without queueing.
The Governor writes/clears this key from `/api/acquisition/lanes/mm_ctrl`
pause/resume and its budget-trip cron.

## Non-goals

- Sends still only ever leave via the dispatcher (`Acquisition | Send
  Dispatcher`), which re-checks `status='approved'` — the scheduler never
  emails anyone directly.
- No change to the UNIQUE `(lead_id, frame_version, touch_number)` idempotency
  constraint or the unsubscribe webhook.
