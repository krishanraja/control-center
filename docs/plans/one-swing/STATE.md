# One swing: STATE (read first)

Charter in `CHARTER.md`. Decision in `docs/DECISIONS/016-ikigai-v4-one-swing.md`.

- Last updated: 2026-09-06 (all six packages shipped on branch `claude/control-center-evolution-sp6hiu`)
- Gate open: G1 (jobs 1 and 2). G2, G3, G4 closed.

## Ledger

| Package | Status | Notes |
|---|---|---|
| P1 Canon repoint | DONE 2026-09-06 | Migration `20260906100000_one_swing_canon` applied to production. `goal:os:mission` active, three OS goals dropped by status, `north_star` mirror updated, three dated tasks seeded (12 Sep rerun, 5 Oct stop rule, 5 Dec review). `job` tag on goals, tasks, daily_focus. `api/_mission.ts` feeds every canon prompt. Rules v2 and v4 purpose lines on the Focus tab. `room_face` ICP lane first, three lanes parked. |
| P2 The Room (job 1) | DONE 2026-09-06 | Migration `20260906110000_room_targets` applied. `/api/room` (list, add, seed, draft, transitions, Monday cron 06:00 New York). People → Room lane; Home RoomStrip when drafts wait. `e2e/room.spec.ts` green. |
| P3 The scorecard (job 2) | DONE 2026-09-06 | Migration `20260906120000_scorecard` applied. `/api/scorecard` (read, override), `github-sync` (Sat 04:00 UTC), `friday` (Sat 04:30 UTC, freeze, variance, tripwire), `monday` (10:30 UTC, Telegram, partner Gmail draft). Home vitals line is the scorecard; ScorecardPanel in a SlideOver. Unasked hours reads 'not measured yet' until `GITHUB_TOKEN` and `GITHUB_REPOS` are set. |
| P4 Feed the demand engine (job 4) | DONE 2026-09-06 | Friday brief carries the face block and cuts uncited claims. Published ideas, sent and pushed briefs record a `publish` ship (dedup `idea:<id>`, `brief:<week>`). |
| P5 Compound runway | DONE 2026-09-06 | Migration `20260906130000_compound_cash_balances` applied. Settings → Cash on hand; Spend tab opens with the runway sentence. 150 Vitest tests, boundary checks green. |
| P6 Park and retire | DONE 2026-09-06 | Bridges lane behind `VITE_BRIDGES_LANE_ENABLED`, deep link intact. Hunter parked in `docs/AGENTS.md`; `agents.active` untouched (Krish's call). |

## Ops steps owed by Krish

- [ ] Vercel env: `GITHUB_TOKEN`, `GITHUB_REPOS`, `GITHUB_AUTHOR`, `UNASKED_HOURS_PER_COMMIT` (optional, default 0.5), `PARTNER_EMAIL` (when a partner exists). Build-time `VITE_BRIDGES_LANE_ENABLED` only if the job search resumes.
- [ ] `update public.agents set active=false where id='hunter'` if the job search is to stop showing in the roster. Your call; the lane is already hidden.
- [ ] Say the mission out loud to one person you respect (weekend of 6 Sep). The OS cannot do this one.
- [ ] Enter a cash balance in Compound Settings so the runway line has something to say.

## Gate log

| Date | Gate | Evidence |
|---|---|---|
| 2026-09-06 | G1 opened | Ikigai v4 locked 5 Sep; this plan. |
