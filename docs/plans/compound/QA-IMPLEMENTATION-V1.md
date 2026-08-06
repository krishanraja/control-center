# UX Test Report: COMPOUND local implementation V1

## Verdict

The approved dashboard remains the complete home screen and the new question flow works as a separate, reversible route. Local mobile and desktop cases pass. Production is live at `https://compound.krishraja.com`; the sign-in shell, headers, JWT gate, Supabase schema, anonymous denial, approved-member session, private snapshot read, streamed model answer, persistence and idempotent retry are certified.

## Scope and evidence

- Repository and source revision: `C:\Users\krish\dev\control-center`, `feat/compound-foundation`, uncommitted working tree based on `09c0f88750774f014a91d493e86d9acc50065a7c`
- Deployment URL, environment and deployed revision: `https://compound.krishraja.com`, production deployment `dpl_Hgb6L4BU36j1TSnrPQahgKTz6Xt7`
- Source/deployment identity match: confirmed for the temporary local server
- Retrieved/tested at: 2026-08-06 EDT
- Viewports and browser: Chromium, 390 by 844 and 1440 by 1000
- Primary tasks attempted: understand today's view; switch horizon; open the accessible holdings list; open Ask without losing the dashboard; submit a suggested question; inspect evidence; return to today; understand quiet and stale states
- Access or data limitations: the approved live member exists; dashboard state tests still use deterministic starter data rather than a daily market feed
- Write authority: authorized production Auth, member, starter-snapshot and synthetic smoke-test mutations
- Test-data and cleanup boundary: the provider smoke test used a temporary synthetic snapshot containing no personal or portfolio information; its snapshot and chat rows were deleted after verification
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
| Live auth, persistence and provider recovery | verified | accepted production sign-in email, approved member session, rejected unknown signup, two RLS-scoped snapshots, streamed production SSE, saved user/assistant pair and idempotent retry | The private vertical slice works through the custom domain without exposing data anonymously or creating unknown users. |

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

## Remaining scope

- The two private starter snapshots are deterministic examples; the daily Financial Modeling Prep feed and engines remain a separate release phase.
- Supabase accepted the production sign-in email; inbox receipt and link opening remain recipient-side actions, while server-side generation and redirect resolution pass.
- Full authenticated visual QA on the final domain can be repeated when a human opens the private magic link; API-level signed-in data, streaming and persistence checks pass now.

## Verification after authorized fixes

| Finding | Original reproduction | Regression checks | Result |
|---|---|---|---|
| 10-pixel mobile overflow | failed before repair | partial, quiet, stale, dashboard and Ask routes at both target widths | fixed |
