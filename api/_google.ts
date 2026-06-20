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

export async function googleAccessToken(scopes: string[]): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  const subject = process.env.GOOGLE_IMPERSONATE_SUBJECT
  if (!email || !key) return null
  key = key.replace(/\\n/g, '\n') // env stores PEM newlines escaped

  const scopeKey = scopes.join(' ') + (subject ? `|${subject}` : '')
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
  const headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject || ''}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
  ].join('\r\n')
  const raw = b64url(`${headers}\r\n\r\n${input.body || ''}`)
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw } }),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !j?.id) return null
    return { id: j.id, url: 'https://mail.google.com/mail/u/0/#drafts' }
  } catch {
    return null
  }
}

/** Create a Google Doc (in Drive) from plain text. Returns { id, url } or null. */
export async function createDriveDoc(input: { name: string; content: string }): Promise<{ id: string; url: string } | null> {
  const token = await googleAccessToken(['https://www.googleapis.com/auth/drive.file'])
  if (!token) return null
  const boundary = `cc${Date.now()}${Math.random().toString(16).slice(2)}`
  const metadata = { name: input.name, mimeType: 'application/vnd.google-apps.document' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.content}\r\n--${boundary}--`
  try {
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
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
