/**
 * Placeholders for the credentials that used to sit in the mirror files.
 *
 * Ten checked-in workflow JSONs carried the live Supabase service-role key in
 * plaintext, in both the `apikey` and `Authorization` header positions. That
 * key bypasses RLS entirely, including on contact_intelligence, whose own
 * column comment says its judgments about named people must never leave the
 * service role.
 *
 * Scrubbing them alone would break the git-first loop, because sync.mjs PUTs
 * the file verbatim and audit.mjs compares it verbatim: a placeholder in the
 * file and a real key in the cloud is permanent, unfixable drift, and drift
 * that can never be resolved is drift nobody reads. So the substitution is
 * symmetric, and each direction is the inverse of the other:
 *
 *   sync   resolve()  placeholder -> real value, just before the PUT
 *   audit  redact()   real value  -> placeholder, on the cloud copy before diff
 *
 * The value never lands on disk and never appears in a diff. If the env var is
 * missing, resolve() throws rather than PUTting the literal string
 * "{{SUPABASE_SERVICE_ROLE_KEY}}" into a live workflow, which would fail at
 * request time in a way that looks like an auth bug rather than a deploy bug.
 */

/** Placeholder token -> the env var holding the real value. */
export const PLACEHOLDERS = {
  '{{SUPABASE_SERVICE_ROLE_KEY}}': 'SUPABASE_SERVICE_ROLE_KEY',
  '{{SUPABASE_ANON_KEY}}': 'SUPABASE_ANON_KEY',
  // Added 2026-08-29: a live Telegram bot token was hardcoded in 8 workflow
  // snapshots and check-no-secrets had no rule for it. Cloud had drifted to a
  // DIFFERENT bot token, so a --apply would also have swapped the bot.
  '{{TELEGRAM_BOT_TOKEN}}': 'TELEGRAM_BOT_TOKEN',
}

function walk(value, fn) {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map(v => walk(v, fn))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, fn)
    return out
  }
  return value
}

/**
 * placeholder -> real value. Used by sync before the PUT.
 * Throws when a placeholder is present and its env var is not set.
 */
export function resolvePlaceholders(json, env = process.env) {
  const missing = new Set()
  const resolved = walk(json, s => {
    let out = s
    for (const [token, varName] of Object.entries(PLACEHOLDERS)) {
      if (!out.includes(token)) continue
      const real = env[varName]
      if (!real) { missing.add(varName); continue }
      out = out.split(token).join(real)
    }
    return out
  })
  if (missing.size) {
    throw new Error(
      `Cannot sync: workflow contains ${[...missing].map(v => `{{${v}}}`).join(', ')} ` +
      `but ${[...missing].join(', ')} is not set in the environment. ` +
      `Set it rather than pasting the key into the file.`,
    )
  }
  return resolved
}

/**
 * real value -> placeholder. Used by audit on the CLOUD copy before diffing,
 * so a scrubbed local file and a live cloud workflow compare equal.
 */
export function redactKnown(json, env = process.env) {
  const pairs = Object.entries(PLACEHOLDERS)
    .map(([token, varName]) => [env[varName], token])
    // Guard against an empty or trivially short env var turning every string
    // in the file into a placeholder.
    .filter(([real]) => typeof real === 'string' && real.length >= 20)
  if (!pairs.length) return json
  return walk(json, s => {
    let out = s
    for (const [real, token] of pairs) if (out.includes(real)) out = out.split(real).join(token)
    return out
  })
}

/** True when the value still carries a placeholder anywhere inside it. */
export function hasPlaceholder(json) {
  let found = false
  walk(json, s => {
    for (const token of Object.keys(PLACEHOLDERS)) if (s.includes(token)) found = true
    return s
  })
  return found
}
