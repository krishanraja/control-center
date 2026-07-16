import type { DecisionKind } from '../hooks/useHomeIntelligence'

/**
 * Kind-aware navigator. Maps `(kind, id)` to `(tab, params)` so every
 * Home / Today / Decisions Waiting click lands at the correct detail
 * surface instead of dumping into Today.
 *
 * The Postgres `decisions_waiting` view also exposes a `route_target`
 * column built with the same rules; this lib is the client-side mirror
 * so we can route off `top_three.action_kind`/`action_target_id` (which
 * never goes through that view) using identical logic.
 */
export interface RouteTarget {
  tab: string
  params: Record<string, string>
}

export function routeDecision(kind: DecisionKind | string, id: string | null | undefined): RouteTarget {
  const safeId = id ?? ''
  switch (kind) {
    case 'task':
      return { tab: 'today', params: safeId ? { task: safeId } : {} }
    case 'idea':
      return { tab: 'content', params: safeId ? { idea: safeId } : {} }
    case 'guest':
      return { tab: 'guests', params: safeId ? { guest: safeId } : {} }
    case 'visibility':
      return { tab: 'guests', params: safeId ? { target: safeId } : {} }
    case 'lead':
      return { tab: 'leads', params: safeId ? { lead: safeId } : {} }
    case 'correction':
      return { tab: 'org', params: safeId ? { correction: safeId } : {} }
    case 'skill_proposal':
      return { tab: 'org', params: safeId ? { skill_proposal: safeId } : {} }
    case 'content_decision':
      // The typed weekly queue lives in the Content tab's This Week room.
      return { tab: 'content', params: {} }
    case 'inbox_returned':
      // The returned capture surfaces as a Today decision on its routed task.
      return { tab: 'today', params: safeId ? { decision: `inbox_returned:${safeId}` } : {} }
    case 'vera_gap':
      return { tab: 'today', params: safeId ? { decision: `vera_gap:${safeId}` } : {} }
    case 'sequence_approval':
      return { tab: 'acquisition', params: safeId ? { seq: safeId } : {} }
    case 'send_sample':
      return { tab: 'acquisition', params: safeId ? { send: safeId } : {} }
    default:
      return { tab: 'today', params: {} }
  }
}

/**
 * Convenience for components that already have a `(tab, params) => void`
 * navigate function. Calls navigate with the resolved target.
 */
export function navigateDecision(
  navigate: ((tab: string, params?: Record<string, string>) => void) | undefined,
  kind: DecisionKind | string,
  id: string | null | undefined,
) {
  if (!navigate) return
  const target = routeDecision(kind, id)
  navigate(target.tab, target.params)
}
