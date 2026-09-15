// The Hunt lane on People (id `bridges`, so every deep link still resolves).
//
// Parked on 2026-09-05 under the ikigai v4, un-parked on 2026-09-07 on Krish's
// instruction. The code was un-parked; the environment was not. Production and
// preview still carried VITE_BRIDGES_LANE_ENABLED=false from the parking (see
// docs/plans/one-swing/STATE.md), so the lane he had asked for back was invisible
// on every device for eight days while the default in this file read "on".
//
// 2026-09-15, Krish: "make sure the Hunt tab actually shows in my control center on
// all devices". So the flag is gone rather than defaulted, and no leftover
// environment variable can hide the lane again. Keeping the function means every
// call site stays put and the flag cannot quietly come back as a one-line default.
export function isBridgesLane(): boolean {
  return true
}
