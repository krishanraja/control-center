import { useEffect, useState } from 'react'

/**
 * Theme + ambient control for the Obsidian Aurora system.
 *
 * Two independent, persisted switches, applied as attributes on <html>:
 *   • theme mode — 'system' | 'light' | 'dark'. `system` follows the OS and
 *     live-updates. Resolved value drives `data-theme` ("light" | "dark"), which
 *     every colour token in index.css keys off.
 *   • ambient   — the experimental "Living Canvas" layer (aurora field + grain +
 *     mood reactivity). Toggle it off for a clean, flat adaptive light/dark.
 *     Applied as `data-ambient="off"`.
 *
 * The initial paint is handled by a tiny inline script in index.html so there is
 * never a flash of the wrong theme; this module is the source of truth once React
 * is alive, and keeps the two in sync via localStorage.
 */

export type ThemeMode = 'system' | 'light' | 'dark'
export type Resolved = 'light' | 'dark'

const THEME_KEY = 'cc-theme'
const AMBIENT_KEY = 'cc-ambient'

const canUse = typeof window !== 'undefined'

export function getMode(): ThemeMode {
  if (!canUse) return 'system'
  const v = localStorage.getItem(THEME_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function getAmbient(): boolean {
  if (!canUse) return true
  return localStorage.getItem(AMBIENT_KEY) !== 'off' // default ON
}

export function systemPrefersDark(): boolean {
  return canUse ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true) : true
}

export function resolve(mode: ThemeMode): Resolved {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

export function apply(mode: ThemeMode, ambient: boolean) {
  if (!canUse) return
  const el = document.documentElement
  el.dataset.theme = resolve(mode)
  if (ambient) el.removeAttribute('data-ambient')
  else el.setAttribute('data-ambient', 'off')
}

// Minimal pub/sub so every mounted control re-renders on a change.
const listeners = new Set<() => void>()
function emit() { listeners.forEach(l => l()) }

export function setMode(mode: ThemeMode) {
  if (canUse) localStorage.setItem(THEME_KEY, mode)
  apply(mode, getAmbient())
  emit()
}

/** Cycle system → light → dark → system. */
export function cycleMode() {
  const next: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
  setMode(next[getMode()])
}

export function setAmbient(on: boolean) {
  if (canUse) localStorage.setItem(AMBIENT_KEY, on ? 'on' : 'off')
  apply(getMode(), on)
  emit()
}

export interface ThemeState {
  mode: ThemeMode
  resolved: Resolved
  ambient: boolean
  setMode: (m: ThemeMode) => void
  cycleMode: () => void
  setAmbient: (on: boolean) => void
}

export function useTheme(): ThemeState {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force(x => x + 1)
    listeners.add(l)
    // When following the system, re-apply + re-render on OS scheme changes.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSys = () => { if (getMode() === 'system') { apply('system', getAmbient()); l() } }
    mq?.addEventListener?.('change', onSys)
    return () => { listeners.delete(l); mq?.removeEventListener?.('change', onSys) }
  }, [])
  return {
    mode: getMode(),
    resolved: resolve(getMode()),
    ambient: getAmbient(),
    setMode,
    cycleMode,
    setAmbient,
  }
}
