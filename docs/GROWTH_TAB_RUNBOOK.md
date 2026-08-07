# Growth Tab Runbook — Acquisition Autonomy

The Growth tab (`#/acquisition`) is the command deck for autonomous customer
acquisition. This runbook covers the one manual setup step, the orchestration
levers, and the standing rules.

## Standing rules (locked 2026-07-16)

1. **No personal brand in public — ever.** Every outbound surface is
   product-branded: sends go out as the product mailbox (per
   `venture_registry.voice_profile.sender/mailbox`), reply and win-back drafts
   are written in the product's voice and sign off as the product team. All
   personal-posting playbook tactics (personal LinkedIn/Reddit/Show-HN) are
   excluded from the autonomous system.
2. **Profitable from day 1 is mechanical, not aspirational.** A lane cannot be
   promoted up the autonomy ladder while its contribution margin is ≤ $0 —
   not even with force. Paid budget requires attributed revenue first
   (Gate 4) and all lanes' paid budgets are capped at $500/mo total.
3. **Stripe stays ground truth.** The Growth tab never writes customer state.

## One-time setup: import the 3 new n8n workflows (~5 min)

The workflow definitions are checked in (sanitized). In n8n → Workflows →
Import from file:

| File (scripts/n8n/) | What it does | After import |
|---|---|---|
| `acquisition-send-dispatcher.workflow.json` | Approved sends → Resend → ledger `sent`; 15-min sweep fallback; per-lane product sender identity; suppression honored | Fill the `Authorization` header on **Send via Resend** (Resend key) and the Supabase `apikey`/`Authorization` headers (service-role key) — same inline-header idiom as the live CTRL workflows. Activate. |
| `acquisition-reply-intake.workflow.json` | Inbound reply → classify (Haiku) → `acquisition_replies` → **suppress the lead's pending sends** → positive intent flips lead to `conversation` | Fill Anthropic `x-api-key` + Supabase headers. Activate. Then point Resend inbound routing (ctrl@ / pulse@ …) at `/webhook/acquisition-reply-inbound`. |
| `zara-geo-citation-sweep.workflow.json` | Weekly probe: is each product cited in AI answers? → `zara_signals` (`geo-citation`) → Growth tab panel | Fill Perplexity `Authorization` + Supabase headers. Activate. ~$1/mo. |

Then add the dispatcher's workflow ID to the breaker map so a budget trip can
pause it (`system_config.acquisition_lane_workflows`):

```json
{ "mm_ctrl": ["TaSvbCwSnpYzNTAd", "<dispatcher-workflow-id>"] }
```

**Never add the Unsubscribe workflow (`HxrGpBEtAeKIQU8S`) to that map** —
suppression must stay live even when a lane is paused.

Finally, apply `scripts/n8n/ctrl-nurture-scheduler-patch.md` to the live
Nurture Scheduler: autonomy-aware `sample_required`, stop creating `send-{id}`
tasks, skip queueing when the lane is paused.

## Orchestration map — where every lever lives

| You want to… | Where |
|---|---|
| Approve/reject queued sends (single or batch) | Growth tab → Send Approvals deck, or the `send_sample` card in the Home decisions inbox |
| Rule on a proposed sequence — **and rewrite its copy first** | `sequence_approval` card → "Open in Growth" → Sequence Review sheet (edit any touch, Save & approve). Amendments are audited. |
| Change a lane's voice / ICP / strategy / never-say list | Growth tab → Lane playbook → Amend (writes `venture_registry.voice_profile`; every agent-written touch conforms immediately) |
| Raise/lower autonomy | Autonomy ladder card. Demote is always one tap. Promote runs the mechanical gates and shows the exact unmet-criteria checklist; force overrides volume gates only — never the profit gate. |
| Set budgets / pause / resume a lane | Profit Governor card. 80% burn → warning task; 100% → breaker pauses the lane's workflows automatically; resume is yours only. |
| Add/remove an acquisition lane | `system_config.acquisition_lanes` (JSON array of venture slugs) |
| Re-map which workflows the breaker may pause | `system_config.acquisition_lane_workflows` |
| See what content converts | Content → capture panel (needs `utm_campaign` on published pieces per ATTR-001; capture intake stamps `leads.attribution_content_idea_id`) |
| Handle a reply | Reply inbox → "Draft product reply" (product voice, product mailbox) or Close. Replies always halt the sequence automatically. |
| Win back churned subscribers | Churn re-engagement queue → Draft win-back |

## Test-and-learn loop (per lane)

frames → sends ledger → `frame_conversion` view → weekly `Maya | Frame A/B
Sweep` (spec: `scripts/n8n/maya-frame-ab-sweep.md`; deterministic winner at
n≥30/arm with 25% relative lift; LLM writes rationale only) →
`frame_promotion` proposal → your ruling → scheduler adopts the winner.
Rejection rates feed Vera's weekly ladder check via `feedback_queue`.

## Outstanding (deliberate)

- **Stripe price map** covers only CTRL (`monthly8usd`, `prod_UA0VCxc0WVM898`) —
  add Fractionl/Legibility/Full Time price IDs to
  `system_config.stripe_price_product_map` as those lanes wire up, or nightly
  reconciliation will skip them.
- **Stripe webhook signing secrets** are unarmed
  (`system_config.stripe_webhook_signing_secrets`) — arm before Full Time goes
  live (playbook §7.4).
- Legibility / Full Time / Pulse capture intakes: clone the CTRL pattern
  (checked-in reference: `acquisition-ctrl-capture-intake.workflow.json`) with
  their lane slug; the whole Growth tab lights up per lane automatically.
