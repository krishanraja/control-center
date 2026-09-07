import { civilYmd } from './civilDate'

// A once-a-day flag, kept in localStorage and keyed by the operator's civil
// date. "Dismissed until tomorrow" is the same idea in three places (the Focus
// Ritual snooze, the evening shutdown prompt), and it kept being rebuilt with
// a different lifetime each time: the shutdown used sessionStorage, which is
// per tab and dies with it, so a new tab or a PWA relaunch brought the prompt
// straight back. One helper, one lifetime: the civil day.
//
// localStorage can throw (private mode, storage full, a locked-down WebView),
// so every read and write is guarded. A failed write means the server-side
// mirror (where one exists) carries the flag alone.

export function isFlaggedToday(key: string, now: Date = new Date()): boolean {
  try { return localStorage.getItem(key) === civilYmd(now) } catch { return false }
}

export function flagToday(key: string, now: Date = new Date()): void {
  try { localStorage.setItem(key, civilYmd(now)) } catch { /* ignore */ }
}

export function clearFlag(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
