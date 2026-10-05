// What Home gives up, in order, when the screen is too short to show it all.
//
// Home never scrolls (Krish, 2026-10-03: "no scroll guaranteed everywhere").
// useFitFolds measures how far it has to fold; this list says what each level
// folds. The order IS the hierarchy: the first thing named is the first thing
// a short screen gives up, and the move he has to answer this morning is the
// last. Every fold keeps what it folded one tap away, never gone.
//
// Two things are not folds any more (2026-10-05, Growth as the standard: one
// primary action, and the evidence only when asked). What the move survived
// is always in its "?", never inline, at every size. And while a move is
// proposed, the move IS the ask: "Pick your 3" steps aside into the Today
// header's Add, and "Set this week's 3" moves onto the This week line
// (GoalLadder's weekAsk). Neither waits for the screen to run out first.
//
//   os       the OS goals fold to one line: the stable frame he knows by
//            heart gives way first
//   week     this week's objectives fold to one line
//   why      the move's why goes into its "?": on a morning with a move,
//            its reasons still outrank the canon he knows
//   tests    a due test folds to one line that says a test is due
//   slots    empty Today slots fold into the Today header's Add
//   actions  the move's controls fit one row; the person line opens the ask
//   card     the move itself folds to one line, which happens only when he
//            has opened something else by hand

export const HOME_FOLDS = ['os', 'week', 'why', 'tests', 'slots', 'actions', 'card'] as const
export type HomeFold = typeof HOME_FOLDS[number]
export type HomeFolds = Record<HomeFold, boolean>

/** What he opened by hand. It stays open, and the next fold in line goes in
 *  its place. One at a time: opening another closes it. */
export type HomePin = 'week' | 'os' | 'tests' | 'card' | null

/** The folds at a level, with what he opened by hand left open. Pure. */
export function foldsAt(level: number, pinned: HomePin = null): HomeFolds {
  const out = {} as HomeFolds
  HOME_FOLDS.forEach((fold, i) => { out[fold] = i < level && fold !== pinned })
  return out
}
