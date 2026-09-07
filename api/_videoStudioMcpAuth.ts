import { createHash, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left, 'utf8').digest()
  const rightHash = createHash('sha256').update(right, 'utf8').digest()
  return timingSafeEqual(leftHash as unknown as Uint8Array, rightHash as unknown as Uint8Array)
}

function sendError(res: VercelResponse, status: number, code: string): true {
  res.status(status).json({ ok: false, error: { code } })
  return true
}

export function guardVideoStudioMcp(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('Allow', 'POST')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Vary', 'Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed')

  const token = process.env.VIDEO_STUDIO_MCP_TOKEN || ''
  if (Buffer.byteLength(token, 'utf8') < 32) return sendError(res, 503, 'mcp_auth_unconfigured')
  if (!safeEqual(headerValue(req.headers.authorization), `Bearer ${token}`)) return sendError(res, 401, 'unauthorized')

  const contentType = headerValue(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return sendError(res, 415, 'unsupported_media_type')
  return false
}

export function videoStudioMcpIdentity(req: VercelRequest): string {
  return createHash('sha256').update(`mcp\u0000${headerValue(req.headers.authorization)}`, 'utf8').digest('hex')
}
