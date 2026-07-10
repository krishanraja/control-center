// ISO-week helpers for the Content Engine v2 lifecycle (docs/CONTENT-ENGINE-V2-SPEC.md).
// The content week runs Mon 00:00 UTC -> Mon; briefs are keyed '2026-W28'.

export function isoWeekLabel(d = new Date()): string {
  // ISO 8601: week 1 contains the first Thursday; weeks start Monday.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function startOfIsoWeek(d = new Date()): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() - (day - 1))
  return t
}

// The purge boundary: the Monday 14:00 UTC that ends the week containing `d`.
export function purgeBoundary(d = new Date()): Date {
  const monday = startOfIsoWeek(d)
  const next = new Date(monday)
  next.setUTCDate(next.getUTCDate() + 7)
  next.setUTCHours(14, 0, 0, 0)
  return next
}
