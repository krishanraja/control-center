import { createHash } from 'node:crypto'

export type HarnessEmitter = {
  emitter_id: string
  surface: 'codex' | 'claude-code' | 'cursor' | 'claude-cloud' | 'perplexity' | 'github-actions' | 'n8n' | 'other'
  machine_scope: string
  enabled: boolean
  daily_limit: number
  revoked_at: string | null
}

export type HarnessEmitterLookup = {
  findByTokenHash(tokenHash: string): Promise<{ data: HarnessEmitter | null; errorCode: string | null }>
}

export type HarnessEmitterAuthResult =
  | { ok: true; emitter: HarnessEmitter }
  | { ok: false; error: 'unauthorized' | 'lookup_failed' }

const TOKEN = /^hmcp1_[A-Za-z0-9_-]{32,128}$/

export async function authenticateHarnessEmitter(
  authorization: string | undefined,
  lookup: HarnessEmitterLookup,
): Promise<HarnessEmitterAuthResult> {
  const prefix = 'Bearer '
  if (!authorization?.startsWith(prefix)) return { ok: false, error: 'unauthorized' }
  const token = authorization.slice(prefix.length)
  if (!TOKEN.test(token)) return { ok: false, error: 'unauthorized' }

  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex')
  const { data, errorCode } = await lookup.findByTokenHash(tokenHash)
  if (errorCode) return { ok: false, error: 'lookup_failed' }
  if (!data?.enabled || data.revoked_at) return { ok: false, error: 'unauthorized' }
  return { ok: true, emitter: data }
}
