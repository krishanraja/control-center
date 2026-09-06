// The Bridges lane on People, a build-time flag.
//
// Bridges (hunter's warm paths into open roles) was parked on 2026-09-05
// under the ikigai v4: the one swing is the Room, and the lane no longer
// earns its tab. The code stays and the `lane=bridges` and `?bridge=` deep
// links keep resolving, so a flip of this flag brings it back without a
// rebuild of anything else. Off by default. Same shape as src/lib/uiV2.ts.
export function isBridgesLane(): boolean {
  return import.meta.env.VITE_BRIDGES_LANE_ENABLED === 'true'
}
