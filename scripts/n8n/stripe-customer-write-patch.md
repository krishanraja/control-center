# N8N patch — write to central `customers` from each Stripe webhook

**Target workflows (5 active):**
- `Stripe | Merciless | Revenue Alert`         (id `TAAeeXv4KwGYG2eU`)
- `Stripe | OnAlert | Revenue Alert`           (id `XUiLRadMc0vvoM83`)
- `Stripe | mind/make OS | Payment Alert`      (id `eB5Si7OAIFO8QZ8J`) — product slug for the central table: ignore (this is the agency-side payments alert, not a product). Skip this one unless Mindmake becomes a product.
- `Stripe | Gutted | Revenue Alert`            (id `yYku4wWh60Nps84u`)
- `Stripe | Fractionl | Revenue Alert`         (id `zjgOgd3puahqBwql`)

**Plus the new workflow** `Stripe | mm-ctrl | Revenue Alert` from
`stripe-mmctrl-revenue-alert.workflow.json` (apply the same upsert node).

## Why

Each workflow today: receive Stripe webhook → Telegram alert → log to
`workflow_runs`. The webhook payload (customer email, MRR, plan,
stripe_customer_id) is discarded. This patch adds an idempotent upsert
into the central `customers` table so the Control Center can render
per-product roll-ups.

## Patch — for each target workflow

After the existing `Stripe Webhook` node, BEFORE or in PARALLEL to the
existing `Telegram` node, insert this `Supabase: Upsert Customer` HTTP
Request node. Wire from `Stripe Webhook` → both Telegram (existing) and
this new upsert (added).

```json
{
  "name": "Supabase: Upsert Customer",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4,
  "parameters": {
    "method": "POST",
    "url": "https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/customers?on_conflict=product,stripe_customer_id",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Prefer", "value": "resolution=merge-duplicates,return=minimal" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ (() => {\n  const evt = $json.body || $json;\n  const t = (evt.type || '').toLowerCase();\n  const obj = evt.data?.object || {};\n  const isPaid    = t === 'checkout.session.completed' || t === 'invoice.payment_succeeded' || t === 'customer.subscription.created' || t === 'customer.subscription.updated';\n  const isChurned = t === 'customer.subscription.deleted';\n  const kind      = isChurned ? 'churned' : isPaid ? 'paid' : 'paid';\n  // Per-workflow override: hard-code the product slug below.\n  const product   = 'PRODUCT_SLUG_HERE';\n  const customerId = obj.customer || obj.id || null;\n  const email      = obj.customer_email || obj.customer_details?.email || obj.receipt_email || null;\n  const name       = obj.customer_details?.name || obj.metadata?.full_name || null;\n  const plan       = obj.plan?.nickname || obj.items?.data?.[0]?.price?.nickname || obj.metadata?.plan || null;\n  const mrr        = obj.plan?.amount ? obj.plan.amount / 100 : (obj.amount_total ? obj.amount_total / 100 : null);\n  const now        = new Date().toISOString();\n  return JSON.stringify({\n    product, kind, email, full_name: name,\n    stripe_customer_id: customerId,\n    stripe_subscription_id: obj.subscription || obj.id || null,\n    plan, mrr_usd: mrr,\n    became_paid_at: isPaid && !isChurned ? now : null,\n    churned_at:     isChurned ? now : null,\n    source: obj.metadata?.utm_source || null,\n    raw: evt,\n  });\n})() }}",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi"
  },
  "credentials": {
    "supabaseApi": { "name": "Supabase account 2" }
  }
}
```

**Replace `PRODUCT_SLUG_HERE`** per workflow with the product slug from the
`customer_product` enum:

| Workflow                           | Slug              |
| ---------------------------------- | ----------------- |
| Stripe \| Merciless \| Revenue Alert    | `merciless`        |
| Stripe \| OnAlert \| Revenue Alert      | `onalert`          |
| Stripe \| Gutted \| Revenue Alert       | `gutted`           |
| Stripe \| Fractionl \| Revenue Alert    | `fractionl_circle` (or `fractionl_pulse` if you split them — for now, use whichever Stripe account this maps to; you can re-attribute by editing rows directly) |
| Stripe \| mm-ctrl \| Revenue Alert      | `mm_ctrl`          |

## Idempotency

The endpoint uses `on_conflict=product,stripe_customer_id` so re-deliveries
of the same Stripe event just update the row instead of inserting a
duplicate. Each workflow's existing Telegram alert + `workflow_runs` log
are untouched — this is purely additive.

## Verify

Fire a test webhook to one of the URLs via Stripe CLI:

```bash
stripe trigger checkout.session.completed
```

Then SQL:

```sql
SELECT product, kind, email, plan, mrr_usd, became_paid_at, raw->>'type' AS evt
  FROM customers
 ORDER BY created_at DESC
 LIMIT 5;
```

A row should appear with `kind='paid'`, the right `product`, and the
event payload in `raw`.

## Roll-back

Delete the new node from each workflow. Existing rows stay; future events
go un-recorded again.
