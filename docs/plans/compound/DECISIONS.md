# COMPOUND decision log

Append-only project decisions. Architecture-wide decisions also receive a repository ADR.

## C-001: Same platforms, isolated product boundary

- Date: 2026-08-06
- Status: locked by Krish
- Decision: COMPOUND lives in the existing GitHub repository and Supabase project, but has no Control Center product or runtime integration.
- Consequence: application code, deployment, schema, policies, secrets and navigation remain independently bounded; repository permissions and Supabase operational blast radius remain shared.
- Revisit trigger: a required COMPOUND capability cannot be secured or operated without reading Control Center data or widening Control Center privileges.

## C-002: Supabase is the runtime source of truth

- Date: 2026-08-06
- Status: locked by Krish
- Decision: daily snapshots, holdings, theses, watchlist and recommendation audit state live in the dedicated Supabase schema.
- Rejected alternative: commit daily JSON into Git.
- Reason: daily data commits would trigger unrelated repository deployment activity, add history noise and create a second mutable source of truth for editable holdings.
- Revisit trigger: sustained Supabase cost or availability makes daily snapshot retention materially worse than an object-store archive.

## C-003: Human approval before material UI implementation

- Date: 2026-08-06
- Status: locked by Krish
- Decision: COMPOUND-DASHBOARD-MOCK-V2 is the approved dashboard direction for mobile and desktop. The Compound Dial, responsive hierarchy and zero-context language contract form the implementation floor.
- Approval evidence: Krish's exact reaction was "Looks good."
- Revisit trigger: Krish explicitly waives this gate for the named surface after seeing the trade-off.

## C-004: Questions are grounded, streamed and isolated

- Date: 2026-08-06
- Status: locked by Krish
- Decision: the signed-in user can ask COMPOUND questions and receive a streamed answer based only on authorised COMPOUND records. The browser never receives an LLM credential. A Supabase server-side function owns model access and reads only the `compound` schema for the authenticated member.
- Surface lock: COMPOUND-ASK-MOCK-V1 is additive. The approved dashboard remains the home screen at `/`; Ask opens separately at `/ask`; Back to today returns to the dashboard. Nothing on the approved dashboard is replaced.
- Approval evidence: Krish's exact reaction was "Looks good as long as what you're showing me there isn't replacing everything else you've done."
- Non-goals: no Control Center context, no unrestricted database retrieval, no trade execution and no answer that silently ignores missing or old data.
- Rejected alternative: call an LLM directly from the browser or give the model general access to the shared Supabase project.
- Revisit trigger: the available Supabase runtime cannot stream reliably or cannot keep the shared-project data boundary narrow enough.

## C-005: COMPOUND remains an internal single-user tool

- Date: 2026-08-11
- Status: locked by Krish
- Decision: COMPOUND is private to Krish. It has no pricing, paid tier, signup, additional member, customer access, or external launch surface.
- Access: one approved Supabase member enters through a server-held magic-word digest. The plaintext word is never written to source, documentation, database rows, logs, or fixtures.
- Reason: the product must prove that its daily market-wide intelligence is useful before commercialization creates customer, billing, support, and security obligations.
- Revisit trigger: Krish judges the private product useful enough to externalize and separately approves the customer identity, billing, support, privacy, and security model.

## C-006: Paid email alerts are dormant

- Date: 2026-08-11
- Status: locked by Krish
- Decision: do not provision or pay for Resend while COMPOUND is internal only. The scheduled workflow does not receive Resend variables; GitHub's failed-workflow notification is the active alert.
- Existing code: the Resend adapter remains an inert future integration point and returns without sending when runtime variables are absent.
- Revisit trigger: externalization or repeated operational misses make a product-branded alert worth a separately approved paid plan.

## C-007: Property surface on free public feeds, personal facts by owner import

- Date: 2026-09-04
- Status: locked by Krish
- Decision: COMPOUND gains a fifth destination, Property, for one owned unit. Market evidence comes only from free feeds (RTA bond medians, Domain Developer API free tier, RBA cash rate). Personal facts (purchase, loan, rate history, rent history, building sales) are entered by the owner through the service-role import CLI or SQL, never by a migration or a committed fixture. The cost ledger Google Sheet remains the editing surface; the pipeline mirrors one tab, identified by gid, read-only.
- Reason: the tab must show what the unit is worth, what rent to charge, what it costs and where to buy next without a paid data plan, and without putting private figures into the repository.
- Consequence: every estimate stores its method, inputs, constants and confidence so the tab can show the working. Runtime secrets for the weekly job live in Supabase Vault behind a service-role-only reader so the GitHub environment needs nothing new. A paid provider (PropRadar, Apify) may be added later as another observation source without changing the schema.
- Revisit trigger: the free Domain tier stops returning suburb statistics or sold listings, or a second property makes the single-subject assumptions in the ranking and rent band wrong.

## C-008: Spend surface reads Control Center spend tables read-only through the pipeline

- Date: 2026-09-05
- Status: locked by Krish
- Decision: COMPOUND gains a sixth destination, Spend, which itemises every outgoing from three sources: the bills and receipts Google Sheet tab (canonical), the Control Center invoice table, and the property ledger mirror. The C-001 revisit trigger is met: a bills-only view cannot show where operating-system money went without `public.meter_daily` and `public.service_registry`. The exception is narrow. Only the Deno spend pipeline reads those tables, only through a GET-only helper (`readPublic`), and it writes nothing to `public`, to the sheet, or to any Control Center surface. Vercel functions and the browser touch the `compound` schema only, and `compound/scripts/check-supabase.mjs` fails if anything under `compound/api` or `compound/src` names the `public` profile.
- Rules: bills and receipts are the money; the usage meter is the breakdown and is never added to a total. Everything is reported in US dollars using RBA table F11.1, with the original currency kept on every row. When both parsers saw the same receipt the sheet row wins: an exact Gmail message id match supersedes, and so does a same-merchant same-amount match within three days (flagged `matched_by_amount`, controlled by `FUZZY_SUPERSEDES`); looser matches are flagged for the eye and still count. The member's one lever is `compound.spend_merchant_overrides`, which reassigns a merchant's scope by SQL today.
- Reason: Krish wants one place that shows all outgoings itemised and current every month, without a third Gmail parser and without either existing tracker changing. Two parsers over overlapping inboxes remain the fragile part; this makes the overlap visible and harmless rather than removing it.
- Revisit trigger: Control Center changes the shape of `spend_invoices`, `meter_daily` or `service_registry`; a second person needs Spend; or the sheet skill and the Control Center parser converge on one ingest, at which point the dedupe tiers should be removed rather than tuned.

