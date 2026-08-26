// Relume-based UI v2, a build-time flag.
//
// When on, the Network tab renders NetworkTab (server-ranked search over the
// full 10,670-person network, built on src/components/ui/) instead of
// DesktopLeadsRE / MobileLeadsRE (client-side substring filter over a capped
// 1,000-row page). Off by default until the two network migrations are applied
// and the importer has run, because the new surface reads tables that do not
// exist until then.
export function isUiV2(): boolean {
  return import.meta.env.VITE_UI_V2_ENABLED === 'true'
}
