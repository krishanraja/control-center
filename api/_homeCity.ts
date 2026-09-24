import { supabase } from './_supabase.js'

/**
 * Which city Krish is in, server side.
 *
 * The value lives in system_config under `operator_home_city` and is the same
 * one the browser holds in localStorage and SQL reads through
 * public.operator_home_city(). One setting, three consumers, in the same shape
 * as api/_timezone.ts — so the events cron, the lane the browser renders, and
 * events_for() in SQL cannot disagree about where he is standing.
 *
 * Before this existed the attend lane had no idea. `location` was NULL on every
 * agent-sourced visibility_targets row because nothing asked for it, and
 * `wrong_location` was an offered reject reason with no field behind it. The
 * complaint that started this ("do not change based on my city") was exactly
 * correct: there was no city.
 */

export type HomeCity = 'london' | 'new_york' | 'sydney'

/**
 * A closed list, unlike the timezone above it, and deliberately so.
 *
 * api/_timezone.ts accepts anything Intl accepts, because a hand-kept list of
 * three zones was wrong the first time he landed somewhere else. That reasoning
 * does not carry here: `events.city` has a CHECK constraint naming these plus
 * 'virtual' and 'other', and discovery has to know which Luma city page and
 * which Meetup query to walk. A city this list does not name has no sources
 * behind it, so accepting it would return an empty lane rather than a wrong one.
 * Widening it means adding rows to event_hosts in the same change.
 */
export const HOME_CITIES: HomeCity[] = ['london', 'new_york', 'sydney']

export const DEFAULT_HOME_CITY: HomeCity = 'new_york'

/**
 * Sydney is temporary and fires on a button press only.
 *
 * docs/MINDMAKE_OS_ARCHITECTURE.md section 3. It is a real choice in the picker
 * and a real filter in the lane, but it is never what a cron or a cold start
 * falls back to, because falling back to it would quietly relocate him.
 */
export const TEMPORARY_CITIES: HomeCity[] = ['sydney']

/** Cities a scheduled pass may source for without being told. */
export const SCHEDULED_CITIES: HomeCity[] = HOME_CITIES.filter(c => !TEMPORARY_CITIES.includes(c))

export function isHomeCity(v: unknown): v is HomeCity {
  return typeof v === 'string' && (HOME_CITIES as string[]).includes(v)
}

/** Display label. `ventureLabel()` is the precedent: one label map, never two. */
const LABELS: Record<HomeCity, string> = {
  london: 'London',
  new_york: 'New York',
  sydney: 'Sydney',
}

export function cityLabel(city: string | null | undefined): string {
  if (!city) return 'Unknown'
  if (isHomeCity(city)) return LABELS[city]
  if (city === 'virtual') return 'Online'
  if (city === 'other') return 'Elsewhere'
  return city
}

let cached: HomeCity | undefined
let cachedAt = 0
const TTL_MS = 60_000

/**
 * The city for THIS request.
 *
 * A caller that knows where it is wins outright, so switching cities in the UI
 * takes effect on the very next request instead of waiting out a per-instance
 * cache. The stored setting stays the fallback for cron and anything
 * server-only. Same contract as resolveTz().
 */
export async function resolveHomeCity(req: { query?: unknown; body?: unknown }): Promise<HomeCity> {
  const q = (req.query as Record<string, unknown> | undefined)?.city
  if (isHomeCity(q)) return q
  const b = (req.body as Record<string, unknown> | undefined)?.city
  if (isHomeCity(b)) return b
  return getOperatorHomeCity()
}

export async function getOperatorHomeCity(): Promise<HomeCity> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached
  try {
    const { data } = await supabase
      .from('system_config').select('value').eq('key', 'operator_home_city').maybeSingle()
    const v = (data as { value?: unknown } | null)?.value
    cached = isHomeCity(v) ? v : DEFAULT_HOME_CITY
  } catch {
    cached = DEFAULT_HOME_CITY
  }
  cachedAt = Date.now()
  return cached
}

export async function setOperatorHomeCity(city: string): Promise<void> {
  if (!isHomeCity(city)) throw new Error('Unsupported home city')
  const { error } = await supabase
    .from('system_config')
    .upsert({ key: 'operator_home_city', value: city, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  cached = city
  cachedAt = Date.now()
}

/**
 * The city a timezone implies, used only to seed a first choice.
 *
 * src/lib/civilDate.ts already offers New York / London / Sydney as zones, so
 * asking a second time for something the OS can infer is a question that did
 * not need asking. Returns undefined rather than guessing for any other zone:
 * a wrong city silently filters the lane to nothing.
 */
export function cityFromTimezone(tz: string | null | undefined): HomeCity | undefined {
  if (!tz) return undefined
  if (tz === 'Europe/London') return 'london'
  if (tz === 'America/New_York') return 'new_york'
  if (tz === 'Australia/Sydney') return 'sydney'
  return undefined
}
