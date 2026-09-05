# One swing: STATE (read first)

Charter in `CHARTER.md`. Decision in `docs/DECISIONS/016-ikigai-v4-one-swing.md`.

- Last updated: 2026-09-06
- Gate open: G1 (jobs 1 and 2). G2, G3, G4 closed.

## Ledger

| Package | Status | Notes |
|---|---|---|
| P1 Canon repoint | DONE 2026-09-06 | Migration `20260906100000_one_swing_canon` applied to production. `goal:os:mission` active, three OS goals dropped by status, `north_star` mirror updated, three dated tasks seeded (12 Sep rerun, 5 Oct stop rule, 5 Dec review). `job` tag on goals, tasks, daily_focus. `api/_mission.ts` feeds every canon prompt. Rules v2 and v4 purpose lines on the Focus tab. `room_face` ICP lane first, three lanes parked. |
| P2 The Room (job 1) | IN PROGRESS | `room_targets`, `/api/room/*`, People lane, Home strip, Monday draft cron. |
| P3 The scorecard (job 2) | IN PROGRESS | `scorecard_weeks`, `build_activity_weeks`, `/api/scorecard/*`, Home line and panel, Friday and Monday crons, GitHub commit count. |
| P4 Feed the demand engine (job 4) | IN PROGRESS | Brief prompt writes for the face; publish writes a ship. |
| P5 Compound runway | IN PROGRESS | `compound.cash_balances`, Spend tab runway line. |
| P6 Park and retire | IN PROGRESS | Bridges behind `VITE_BRIDGES_LANE_ENABLED`; hunter parked in docs. |

## Ops steps owed by Krish

- [ ] Vercel env: `GITHUB_TOKEN`, `GITHUB_REPOS`, `GITHUB_AUTHOR`, `UNASKED_HOURS_PER_COMMIT` (optional, default 0.5), `PARTNER_EMAIL` (when a partner exists). Build-time `VITE_BRIDGES_LANE_ENABLED` only if the job search resumes.
- [ ] `update public.agents set active=false where id='hunter'` if the job search is to stop showing in the roster. Your call; the lane is already hidden.
- [ ] Say the mission out loud to one person you respect (weekend of 6 Sep). The OS cannot do this one.
- [ ] Enter a cash balance in Compound Settings so the runway line has something to say.

## Gate log

| Date | Gate | Evidence |
|---|---|---|
| 2026-09-06 | G1 opened | Ikigai v4 locked 5 Sep; this plan. |
