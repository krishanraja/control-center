// The Hunt lane on People (id `bridges`, so every deep link still resolves).
//
// Parked on 2026-09-05 under the ikigai v4, un-parked on 2026-09-07 on
// Krish's instruction: the job search runs from column A of the Pipeline
// sheet, and this lane is where the roles he said Yes to, their packages and
// the person who can get him in are shown. On by default; setting
// VITE_BRIDGES_LANE_ENABLED=false hides it again without a rebuild of
// anything else. Same shape as src/lib/uiV2.ts.
export function isBridgesLane(): boolean {
  return import.meta.env.VITE_BRIDGES_LANE_ENABLED !== 'false'
}
