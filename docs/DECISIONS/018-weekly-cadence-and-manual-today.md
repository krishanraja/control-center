# ADR-018: Weekly cadence, one writer for tomorrow, and a manual-first Today

- Status: Accepted
- Date: 2026-09-08
- Deciders: Krish

## Context

Krish reported five things about Home and the daily rituals. Checking each
against the repo, the live database, Vercel logs and n8n found the causes:

1. The evening shutdown prompt came back on every page load after X. Its
   dismissal lived in `sessionStorage`, which is per tab and dies with it, so
   every new tab and every PWA relaunch re-armed it. The live database had
   ten morning rows and **zero** evening rows: the shutdown had never been
   saved once.
2. The shutdown only half fed the morning. `tomorrow_one` reached red mode
   and seeded slot 1 of the ritual's picker. The morning gate never showed
   it, `shipped_today` went nowhere, and nothing landed on Home's Today list.
3. Neither ritual pointed at the weekly objectives.
4. Home carried two weekly composers: an inline one in the ladder that
   expanded inside an `overflow-hidden` no-scroll frame, and the Focus
   Ritual overlay. The OS rung still offered "+ Add" although ADR-016 made
   it one line.
5. Today's 3 were picked from machine suggestions or typed inside the
   ritual only; there was no way to write a slot on Home, and `daily_focus`
   was empty in production. Nothing ever closed a week: "this week" was a
   guess from `updated_at`, old objectives lingered as "from last week", and
   no outcome was ever recorded.

## Decision

1. **Shutdown dismissal is per civil day, on the server.** X, "Not now",
   Escape or the backdrop write an evening row with `skipped = true` (the
   morning skip's pattern) and a civil-date flag in `localStorage`
   (`src/lib/dayFlag.ts`, shared with the ritual snooze). The prompt cannot
   return until tomorrow on any device.
2. **One writer for tomorrow.** The shutdown captures tomorrow's 3. Slot 1
   is the ONE (required, concreteness-checked, what red mode reads). Slots 2
   and 3 are optional and may name the weekly objective they serve. The
   evening `POST /api/pilot/checkin` writes the `pilot_checkins` row and
   upserts tomorrow's `daily_focus` row through `api/_dailyFocus.ts`. The
   morning gate shows "Last night you chose" and Home opens on those slots.
3. **One weekly composer.** The Focus Ritual's weekly step is the only place
   a weekly objective is created. The ladder's "+ Add" and the phone's
   create sheet open it. The ladder's inline weekly composer is removed; the
   OS composer appears only at cold start.
4. **Manual first for Today.** Every Today slot on Home is editable in place
   (`POST /api/daily-focus/slot`, which leaves the day `pending`). In the
   ritual the three slots he writes come first, prefilled from the shutdown
   or a hand edit, and the machine's suggestions sit behind a disclosure
   that is only fetched when opened. The lock still runs the calibrator.
5. **Weeks are keyed, closed and archived.** `goals.week_start` is the
   operator's Monday, stamped on create (a weekend entry targets the coming
   Monday). A Saturday 05:00 UTC cron (`/api/goals/week-close`) sets
   still-active weekly rows to `missed` with `closed_at`; done stays done.
   Nothing is deleted: the `goals` table is the archive, the ladder reads
   only this week, and `GET /api/goals/history` reads it by week alongside
   the days locked and picks completed. Monday's ritual shows last week's
   outcomes with a one-tap Carry that clones the row into the new week
   linked by `carried_from`, so the archive shows both attempts.
6. **The weekly ask fires Monday to Friday.** Saturday and Sunday read
   "Week closed" and never ask.
7. **The goal spine carries the frame and the history.** `api/_goals.ts`
   adds today's frame (intent, venture, mode, last night's ONE, what
   shipped) and the last four closed weeks to the block every Ask, the OS
   picks, the pilot builder and the weekly brief already read.

## Alternatives considered

- Keep `tomorrow_one` as the only store and seed the picker: rejected, it is
  the two-clocks problem the calibrator's own comment described.
- Reset the week by deleting or dropping old rows: rejected, drop loses the
  distinction between chosen and missed, and delete loses the archive.
- Make the shutdown optional per device with `localStorage` alone: rejected,
  it would prompt again on the other device the same night.

## Consequences

- Closing a week as `missed` is a stronger signal than "from last week". It
  is the first place the system says no every week; that is the intent of
  the honesty rules, and a change in tone on Home.
- With Today editable on Home, the calibrator (relevance index, Marcus swap
  feedback) runs only when the ritual lock is used.
- `scripts/check-goal-ladder.mts` rule 4 now asserts the split: OS composed
  in the ladder, weekly composed in the ritual, the ladder opening it.
- Migration `20260908090000_goals_week_cadence.sql` adds `week_start`,
  `closed_at`, `carried_from` and the `missed` status, and closes any weekly
  row already past its week.
