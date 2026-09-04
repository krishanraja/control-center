import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const ACCESS_COOKIE = 'cc_access'
const CSRF_VERSION = 'v1'
const CSRF_TTL_SECONDS = 15 * 60

type ErrorCode =
  | 'operator_auth_unconfigured'
  | 'runner_auth_unconfigured'
  | 'runner_signing_unconfigured'
  | 'unauthorized'
  | 'origin_rejected'
  | 'csrf_rejected'
  | 'unsupported_media_type'
  | 'receipt_signature_rejected'
  | 'method_not_allowed'

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of (header || '').split(';')) {
    const splitAt = part.indexOf('=')
    if (splitAt < 0) continue
    cookies[part.slice(0, splitAt).trim()] = part.slice(splitAt + 1).trim()
  }
  return cookies
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = createHash('sha256').update(left, 'utf8').digest()
  const rightBuffer = createHash('sha256').update(right, 'utf8').digest()
  return timingSafeEqual(
    leftBuffer as unknown as Uint8Array,
    rightBuffer as unknown as Uint8Array,
  )
}

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

function configuredAppOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) return null
    const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null
    return url.origin
  } catch {
    return null
  }
}

function operatorConfig(): { accessCode: string; appOrigin: string; csrfSecret: string } | null {
  const accessCode = process.env.ACCESS_CODE || ''
  const appOrigin = configuredAppOrigin(process.env.APP_ORIGIN || '') || ''
  const csrfSecret = process.env.VIDEO_STUDIO_CSRF_SECRET || ''
  if (!accessCode || !appOrigin || Buffer.byteLength(csrfSecret, 'utf8') < 32) return null
  return { accessCode, appOrigin, csrfSecret }
}

function expectedAccessCookie(accessCode: string): string {
  return createHash('sha256').update(accessCode).digest('hex')
}

function suppliedAccessCookie(req: VercelRequest): string {
  return parseCookies(headerValue(req.headers.cookie))[ACCESS_COOKIE] || ''
}

function hasConfiguredOperatorSession(req: VercelRequest, accessCode: string): boolean {
  const supplied = suppliedAccessCookie(req)
  return Boolean(supplied) && safeEqual(supplied, expectedAccessCookie(accessCode))
}

function sendError(res: VercelResponse, status: number, code: ErrorCode): true {
  res.status(status).json({ ok: false, error: { code } })
  return true
}

function applyBaseHeaders(
  res: VercelResponse,
  methods: readonly string[],
  vary: string,
): void {
  res.setHeader('Allow', methods.join(', '))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Vary', vary)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

export function hashVideoStudioIdentity(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex')
}

export function guardVideoStudioOperatorRead(
  req: VercelRequest,
  res: VercelResponse,
  methods: readonly string[] = ['GET'],
): boolean {
  applyBaseHeaders(res, methods, 'Cookie')
  if (!methods.includes(req.method || '')) return sendError(res, 405, 'method_not_allowed')

  const config = operatorConfig()
  if (!config) return sendError(res, 503, 'operator_auth_unconfigured')
  if (!hasConfiguredOperatorSession(req, config.accessCode)) {
    return sendError(res, 401, 'unauthorized')
  }
  return false
}

export function issueVideoStudioCsrfToken(req: VercelRequest, now = Date.now()): {
  token: string
  expiresAt: string
} | null {
  const config = operatorConfig()
  if (!config || !hasConfiguredOperatorSession(req, config.accessCode)) return null

  const expiresAtSeconds = Math.floor(now / 1000) + CSRF_TTL_SECONDS
  const cookie = suppliedAccessCookie(req)
  const signed = `${CSRF_VERSION}.${expiresAtSeconds}.${cookie}`
  const signature = createHmac('sha256', config.csrfSecret).update(signed).digest('hex')
  return {
    token: `${CSRF_VERSION}.${expiresAtSeconds}.${signature}`,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  }
}

function validCsrfToken(req: VercelRequest, csrfSecret: string, now = Date.now()): boolean {
  const token = headerValue(req.headers['x-video-studio-csrf'])
  const [version, rawExpiry, suppliedSignature, ...rest] = token.split('.')
  if (rest.length || version !== CSRF_VERSION || !/^\d{10}$/.test(rawExpiry || '')) return false

  const expiresAtSeconds = Number(rawExpiry)
  const nowSeconds = Math.floor(now / 1000)
  if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds <= nowSeconds) return false
  if (expiresAtSeconds - nowSeconds > CSRF_TTL_SECONDS) return false

  const cookie = suppliedAccessCookie(req)
  if (!cookie || !suppliedSignature) return false
  const signed = `${version}.${expiresAtSeconds}.${cookie}`
  const expectedSignature = createHmac('sha256', csrfSecret).update(signed).digest('hex')
  return safeEqual(suppliedSignature, expectedSignature)
}

export function guardVideoStudioOperatorMutation(
  req: VercelRequest,
  res: VercelResponse,
  methods: readonly string[] = ['POST'],
): boolean {
  applyBaseHeaders(res, methods, 'Cookie, Origin')
  if (!methods.includes(req.method || '')) return sendError(res, 405, 'method_not_allowed')

  const config = operatorConfig()
  if (!config) return sendError(res, 503, 'operator_auth_unconfigured')
  if (!hasConfiguredOperatorSession(req, config.accessCode)) {
    return sendError(res, 401, 'unauthorized')
  }

  const suppliedOrigin = normalizedOrigin(headerValue(req.headers.origin))
  if (!suppliedOrigin || suppliedOrigin !== config.appOrigin) {
    return sendError(res, 403, 'origin_rejected')
  }

  const contentType = headerValue(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    return sendError(res, 415, 'unsupported_media_type')
  }
  if (!validCsrfToken(req, config.csrfSecret)) return sendError(res, 403, 'csrf_rejected')
  return false
}

export function guardVideoStudioRunner(
  req: VercelRequest,
  res: VercelResponse,
  methods: readonly string[] = ['POST'],
): boolean {
  applyBaseHeaders(res, methods, 'Authorization')
  if (!methods.includes(req.method || '')) return sendError(res, 405, 'method_not_allowed')

  const runnerToken = process.env.VIDEO_STUDIO_RUNNER_TOKEN || ''
  if (Buffer.byteLength(runnerToken, 'utf8') < 32) {
    return sendError(res, 503, 'runner_auth_unconfigured')
  }
  const authorization = headerValue(req.headers.authorization)
  if (!safeEqual(authorization, `Bearer ${runnerToken}`)) {
    return sendError(res, 401, 'unauthorized')
  }
  const contentType = headerValue(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    return sendError(res, 415, 'unsupported_media_type')
  }
  return false
}

export function verifyVideoStudioRunnerReceipt(
  receiptHash: string,
  suppliedSignature: string,
): 'valid' | 'unconfigured' | 'invalid' {
  const signingKey = process.env.VIDEO_STUDIO_RUNNER_SIGNING_KEY || ''
  if (Buffer.byteLength(signingKey, 'utf8') < 32) return 'unconfigured'
  const expected = createHmac('sha256', signingKey).update(receiptHash).digest('hex')
  return safeEqual(expected, suppliedSignature) ? 'valid' : 'invalid'
}

export function rejectVideoStudioRunnerReceipt(
  res: VercelResponse,
  result: 'unconfigured' | 'invalid',
): true {
  return result === 'unconfigured'
    ? sendError(res, 503, 'runner_signing_unconfigured')
    : sendError(res, 401, 'receipt_signature_rejected')
}

export function videoStudioOperatorIdentity(req: VercelRequest): string {
  return hashVideoStudioIdentity('operator', suppliedAccessCookie(req))
}

export function videoStudioRunnerIdentity(runnerId: string): string {
  return hashVideoStudioIdentity('runner', process.env.VIDEO_STUDIO_RUNNER_TOKEN || '', runnerId)
}
