import crypto from 'node:crypto'

// Direct Google integration (no n8n) for Gmail drafts and Drive docs. Uses a
// service-account JWT → OAuth access token; no extra npm deps. Everything is
// GATED on env: with the service account unset, every function returns null and
// callers fall back to their existing behaviour. Gmail requires domain-wide
// delegation + GOOGLE_IMPERSONATE_SUBJECT (the Workspace user to act as).
//
// Required env to activate:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL      (the …@….iam.gserviceaccount.com address)
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (the PEM; literal \n are unescaped)
//   GOOGLE_IMPERSONATE_SUBJECT        (e.g. krish@themindmaker.ai — Gmail only)

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Tiny per-scope token cache (warm across calls in a single function instance).
const tokenCache = new Map<string, { token: string; exp: number }>()

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
}

// `impersonate: false` asks for a token as the service account itself. GA4 is
// granted by adding the SA's own email as a property Viewer, not through
// domain-wide delegation, so impersonating a Workspace user there would fail.
// `credentials` swaps in a different service account (see GA4 below).
export async function googleAccessToken(
  scopes: string[],
  opts: { impersonate?: boolean; credentials?: { email?: string; key?: string } } = {},
): Promise<string | null> {
  const email = opts.credentials ? opts.credentials.email : process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let key = opts.credentials ? opts.credentials.key : process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  const subject = opts.impersonate === false ? undefined : process.env.GOOGLE_IMPERSONATE_SUBJECT
  if (!email || !key) return null
  key = key.replace(/\\n/g, '\n') // env stores PEM newlines escaped

  const scopeKey = `${email}|` + scopes.join(' ') + (subject ? `|${subject}` : '')
  const now = Math.floor(Date.now() / 1000)
  const cached = tokenCache.get(scopeKey)
  if (cached && cached.exp > now + 60) return cached.token

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim: Record<string, any> = {
    iss: email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  if (subject) claim.sub = subject
  const payload = b64url(JSON.stringify(claim))

  let assertion: string
  try {
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(`${header}.${payload}`)
    assertion = `${header}.${payload}.${b64url(signer.sign(key))}`
  } catch {
    return null // malformed key
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !j?.access_token) return null
    tokenCache.set(scopeKey, { token: j.access_token, exp: now + (j.expires_in || 3600) })
    return j.access_token
  } catch {
    return null
  }
}

/** Create a Gmail draft as the impersonated user. Returns { id, url } or null. */
export async function createGmailDraft(input: { to: string; subject: string; body: string }): Promise<{ id: string; url: string } | null> {
  const token = await googleAccessToken(['https://www.googleapis.com/auth/gmail.compose'])
  if (!token) return null
  // A draft may have no recipient yet (no address on record); Gmail accepts a
  // draft without a To header and shows the field empty for the sender to fill.
  const headers = [
    input.to ? `To: ${input.to}` : '',
    `Subject: ${input.subject || ''}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
  ].filter(Boolean).join('\r\n')
  const raw = b64url(`${headers}\r\n\r\n${input.body || ''}`)
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw } }),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !j?.id) return null
    // Link to THIS draft, not to the drafts folder.
    //
    // drafts.create returns the draft resource id AND the underlying message
    // id. Gmail's web UI addresses a draft by its MESSAGE id via ?compose=,
    // so that is what the deep link needs; the draft id is kept for the API.
    // This used to return the bare folder URL and throw the id away, which
    // put Krish in a list of drafts and left him to find the right one.
    const messageId = typeof j?.message?.id === 'string' ? j.message.id : null
    const url = messageId
      ? `https://mail.google.com/mail/u/0/#drafts?compose=${encodeURIComponent(messageId)}`
      : 'https://mail.google.com/mail/u/0/#drafts'
    return { id: j.id, url }
  } catch {
    return null
  }
}

/**
 * Send a plain-text email as the impersonated user. Returns { id } or null.
 *
 * Separate from createGmailDraft because the two need different scopes and
 * differ in what they promise: a draft waits for a human, a send has already
 * left. Alerts have to leave — a draft nobody opens is the same as no alert.
 * gmail.send must be in the domain-wide delegation for this to work; when it
 * is not, the caller falls back to a draft rather than failing silently.
 */
export async function sendGmail(input: { to: string; subject: string; body: string }): Promise<{ id: string } | null> {
  const token = await googleAccessToken(['https://www.googleapis.com/auth/gmail.send'])
  if (!token) return null
  const headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject || ''}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
  ].join('\r\n')
  const raw = b64url(`${headers}\r\n\r\n${input.body || ''}`)
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !j?.id) return null
    return { id: j.id }
  } catch {
    return null
  }
}

/** Create a Google Doc (in Drive) from plain text. Returns { id, url } or null. */
export async function createDriveDoc(input: { name: string; content: string }): Promise<{ id: string; url: string } | null> {
  const token = await googleAccessToken(['https://www.googleapis.com/auth/drive.file'])
  if (!token) return null
  const boundary = `cc${Date.now()}${Math.random().toString(16).slice(2)}`
  // Service accounts have no personal Drive quota: docs must land either in the
  // impersonated user's Drive (domain-wide delegation) or in a Shared Drive
  // (GOOGLE_DRIVE_FOLDER_ID). Set a folder parent when provided.
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const metadata: Record<string, any> = { name: input.name, mimeType: 'application/vnd.google-apps.document' }
  if (folderId) metadata.parents = [folderId]
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.content}\r\n--${boundary}--`
  try {
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !j?.id) return null
    return { id: j.id, url: j.webViewLink || `https://docs.google.com/document/d/${j.id}/edit` }
  } catch {
    return null
  }
}

// GA4 prefers its own service account (GA4_SERVICE_ACCOUNT_*), so the property
// Viewer grant belongs to an identity that can only read analytics. Falls back
// to the shared GOOGLE_SERVICE_ACCOUNT_* when the GA pair is unset.
function ga4Credentials(): { email?: string; key?: string; source: string } {
  if (process.env.GA4_SERVICE_ACCOUNT_EMAIL || process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return { email: process.env.GA4_SERVICE_ACCOUNT_EMAIL, key: process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY, source: 'GA4_SERVICE_ACCOUNT_*' }
  }
  return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, source: 'GOOGLE_SERVICE_ACCOUNT_*' }
}

/**
 * Run one GA4 Data API report as the service account. Returns the raw report
 * or { error } so a caller can say WHY a key is missing (not shared, API off,
 * wrong property id) rather than writing a fake zero.
 *
 * Needs: the Google Analytics Data API enabled in the SA's GCP project, and the
 * SA email added as Viewer on the property. `propertyId` is the numeric id from
 * GA Admin → Property details, not the G- measurement id.
 */
export async function runGa4Report(propertyId: string, body: Record<string, unknown>): Promise<{ report: any } | { error: string }> {
  const creds = ga4Credentials()
  const token = await googleAccessToken(['https://www.googleapis.com/auth/analytics.readonly'], { impersonate: false, credentials: creds })
  if (!token) return { error: `no service-account token (${creds.source} unset or key invalid)` }
  try {
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j: any = await r.json().catch(() => ({}))
    // Name the identity on failure: a 403 means THIS email lacks Viewer on the property.
    if (!r.ok) return { error: `GA4 ${r.status} as ${creds.email} (${creds.source}): ${j?.error?.message || 'request failed'}` }
    return { report: j }
  } catch (e: any) {
    return { error: String(e?.message || e) }
  }
}
