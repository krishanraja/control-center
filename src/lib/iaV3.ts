// Simplified IA (12 tabs -> 6), build-time flag in the homeV2.ts pattern.
//
// When on: Today folds into Home's decision queue, Pipeline + Network +
// Visibility become the People tab (lane switcher), Org + Intel + Flows +
// Systems become the OS tab (subtabs), and Subscriptions demotes to the
// drawer. Legacy hashes keep working through the App-level alias layer.
export function isSimplifiedIA(): boolean {
  return import.meta.env.VITE_IA_V3_ENABLED === 'true'
}
