# UX Test Report: COMPOUND local implementation V1

## Verdict

The approved dashboard remains the complete home screen and the new question flow works as a separate, reversible route in the tested local sample-data build. The primary mobile and desktop tasks are usable with a keyboard, reduced motion and partial, quiet and stale data. Live authentication, Supabase persistence and provider output are not certified because the migration, function secrets and deployment remain intentionally unapplied.

## Scope and evidence

- Repository and source revision: `C:\Users\krish\dev\control-center`, `feat/compound-foundation`, uncommitted working tree based on `09c0f88750774f014a91d493e86d9acc50065a7c`
- Deployment URL, environment and deployed revision: temporary local Vite server only; no Vercel deployment
- Source/deployment identity match: confirmed for the temporary local server
- Retrieved/tested at: 2026-08-06 EDT
- Viewports and browser: Chromium, 390 by 844 and 1440 by 1000
- Primary tasks attempted: understand today's view; switch horizon; open the accessible holdings list; open Ask without losing the dashboard; submit a suggested question; inspect evidence; return to today; understand quiet and stale states
- Access or data limitations: explicit sample-data mode; no live account, database write, LLM provider call or deployment
- Write authority: local implementation and synthetic browser interaction only
- Test-data and cleanup boundary: repository fixture; no external cleanup required
- Evidence location: `C:\Users\krish\.scratch\compound\qa-implementation-v1`; sample data only, no credentials or private session data

## Results by task

| Task | Status | Evidence | Consequence |
|---|---|---|---|
| Read the full daily dashboard | verified | mobile and desktop partial-state renders | The Ask feature does not replace or hide existing work. |
| Switch 3-month / 1-year view and keep route state | verified | browser URL and `aria-pressed` checks | The chosen time period remains explicit. |
| Open the full holdings list | verified | rendered table and expanded-state check | The circular view has an accessible text equivalent. |
| Ask and receive a progressive answer | verified in sample mode | mobile and desktop Ask renders plus component/SSE tests | The question is preserved, the answer is readable and the evidence is visible. |
| Return to the dashboard | verified | `/ask` to `/` browser check | Ask is additive and reversible. |
| Understand quiet and stale states | verified in sample mode | quiet dashboard, stale dashboard and stale Ask renders | Old data is not presented as a new recommendation. |
| Live auth, persistence and provider recovery | blocked | production mutations remain gated | Requires the approved migration, allowlisted account and dedicated Edge Function secret. |

## Confirmed finding

### P2 Mobile circular-chart highlight caused page overflow

- Environment, route, viewport: local sample mode, `/?state=partial`, Chromium 390 by 844
- Reproduction: open the dashboard and compare document scroll width with viewport width
- Expected: no horizontal page movement
- Observed: the rotated highlight extended the page by 10 pixels
- Consequence: mobile users could accidentally pan sideways and see the layout shift
- Evidence: deterministic overflow check before and after the repair
- Smallest repair: clip the rotated highlight within the circular chart
- Fix status: implemented and re-tested; all seven browser cases now have zero horizontal overflow

## What held up

The full dashboard remains present after Ask was added. The separate Ask route, Back to today path, horizon state, evidence list, late-data explanation, keyboard focus, minimum control height, reduced-motion answer, quiet state and stale refusal all passed in the local rendered build. No console error appeared in the tested cases.

## Unverified and blocked

- Supabase migration syntax and policies were statically checked but not executed locally because Docker is unavailable.
- Live magic-link delivery and membership rejection need a designated account after production or preview configuration is approved.
- The LLM provider, model and dedicated secret have not been selected or set, so live response timing, timeout and retry behavior remain unverified.
- Vercel deep links, headers, CSP and domain behavior require a matching preview or production deployment.

## Verification after authorized fixes

| Finding | Original reproduction | Regression checks | Result |
|---|---|---|---|
| 10-pixel mobile overflow | failed before repair | partial, quiet, stale, dashboard and Ask routes at both target widths | fixed |
