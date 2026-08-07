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
