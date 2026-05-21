# N8N patch — populate `customers.attribution_*` on every Stripe webhook

**Targets:** the 5 active Stripe revenue alert workflows (Merciless · OnAlert · Gutted · Fractionl · mm-ctrl). Each already upserts into `customers` via the patch in `stripe-customer-write-patch.md`. This patch is **additive**: it inserts a lookup-and-stamp step *before* the upsert.

## Why

Every paid signup is a revenue event with an upstream cause: a lead, a campaign, an outbound touch, organic referral. Today the upstream link is lost. Pillar 1 surfaces ROI by source — but only if attribution is captured at the moment of conversion.

## Patch — single node, dropped before the `Supabase: Upsert Customer` node

Insert a Code node titled `Resolve Attribution`. It receives the Stripe event, calls Supabase to look up a matching lead by email, sets attribution fields, then passes a merged payload downstream.

```javascript
// Inputs: $json.body is the Stripe event.
const evt   = $json.body || $json;
const obj   = evt.data?.object || {};
const email = obj.customer_email
           || obj.customer_details?.email
           || obj.receipt_email
           || null;
const utm   = obj.metadata?.utm_source
           || obj.metadata?.attribution_channel
           || null;

let attribution_lead_id   = null;
let attribution_task_id   = null;
let attribution_channel   = utm || null;
let attribution_confidence = utm ? 'utm' : 'unattributed';

if (email) {
  // Look up the most recent lead matching this email. Service role key
  // lives in the existing Supabase credential.
  const url = `https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/leads?email=ilike.${encodeURIComponent(email)}&select=id,promoted_task_id,assignee_agent&order=created_at.desc&limit=1`;
  const res = await this.helpers.httpRequest({
    method: 'GET',
    url,
    headers: {
      apikey: $credentials.supabaseApi.apiKey,
      Authorization: `Bearer ${$credentials.supabaseApi.apiKey}`,
    },
    json: true,
  });
  if (Array.isArray(res) && res.length > 0) {
    attribution_lead_id    = res[0].id;
    attribution_task_id    = res[0].promoted_task_id || null;
    attribution_channel    = attribution_channel || `agent:${res[0].assignee_agent || 'unknown'}`;
    attribution_confidence = 'exact_email';
  }
}

return [{
  json: {
    ...evt,                     // preserve original event for downstream Upsert
    _attribution: {
      attribution_lead_id,
      attribution_task_id,
      attribution_channel,
      attribution_confidence,
    },
  },
}];
```

Then patch the `Supabase: Upsert Customer` node's jsonBody to merge in `$json._attribution`:

```diff
 jsonBody: "={{ (() => {
   const evt = $json.body || $json;
+  const attr = $json._attribution || {};
   ...
   return JSON.stringify({
     product, kind, email, full_name: name,
     stripe_customer_id: customerId,
     ...,
     raw: evt,
+    attribution_lead_id:    attr.attribution_lead_id    || null,
+    attribution_task_id:    attr.attribution_task_id    || null,
+    attribution_channel:    attr.attribution_channel    || null,
+    attribution_confidence: attr.attribution_confidence || 'unattributed',
   });
 })() }}"
```

## Verify

Fire a test Stripe event for an email that matches an existing lead:

```bash
stripe trigger checkout.session.completed \
  --override checkout_session:customer_email=<known-lead-email@example.com>
```

Then SQL:

```sql
SELECT email, attribution_lead_id, attribution_task_id,
       attribution_channel, attribution_confidence
  FROM customers
 ORDER BY created_at DESC
 LIMIT 5;
```

The most recent row should have `attribution_lead_id` populated and `attribution_confidence='exact_email'`.

## Roll-back

Remove the `Resolve Attribution` node and revert the upsert node's jsonBody. Existing rows keep their attribution; new rows go back to attribution=null.
