import type { ContentIdeaRow } from '../hooks/useRealtimeContentIdeas'

export interface DraftCluster {
  /** Stable id derived from the sorted member ids. */
  key: string
  members: ContentIdeaRow[]
  /** Nightly-written 1-2 sentence narrative summary, if any member carries one. */
  summary: string | null
}

// meta.cluster_summary is written by the nightly clustering job but isn't in the
// typed meta shape — read it defensively.
function clusterSummaryOf(i: ContentIdeaRow): string | null {
  const s = (i.meta as { cluster_summary?: string | null } | null | undefined)?.cluster_summary
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

/**
 * Group drafts into narrative clusters using the `related_idea_ids` written by
 * the nightly clustering job (single-link union-find, scoped to the given set).
 * Mirrors scripts/clustering/build-narrative-clusters.ts so the phone surfaces the
 * same threads the backend already discovered — no new similarity math.
 *
 * Returns clusters of ≥2 mutually-related drafts (largest first), plus the loose
 * drafts that belong to no cluster. Loose drafts render exactly as before.
 */
export function clusterDrafts(drafts: ContentIdeaRow[]): { clusters: DraftCluster[]; loose: ContentIdeaRow[] } {
  const present = new Set(drafts.map(d => d.id))
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  const union = (a: string, b: string) => {
    parent.set(a, parent.get(a) ?? a)
    parent.set(b, parent.get(b) ?? b)
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const d of drafts) {
    parent.set(d.id, parent.get(d.id) ?? d.id)
    for (const rel of d.related_idea_ids || []) {
      if (present.has(rel)) union(d.id, rel)
    }
  }

  const byRoot = new Map<string, ContentIdeaRow[]>()
  for (const d of drafts) {
    const root = find(d.id)
    const arr = byRoot.get(root) || []
    arr.push(d)
    byRoot.set(root, arr)
  }

  const clusters: DraftCluster[] = []
  const loose: ContentIdeaRow[] = []
  for (const members of byRoot.values()) {
    if (members.length >= 2) {
      const ids = members.map(m => m.id).sort()
      const summary = members.map(clusterSummaryOf).find(Boolean) || null
      clusters.push({ key: ids.join('|'), members, summary })
    } else {
      loose.push(members[0])
    }
  }

  clusters.sort((a, b) => b.members.length - a.members.length)
  return { clusters, loose }
}
