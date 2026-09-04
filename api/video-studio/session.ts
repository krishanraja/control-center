import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  guardVideoStudioOperatorRead,
  issueVideoStudioCsrfToken,
  videoStudioOperatorIdentity,
} from '../_videoStudioAuth.js'
import { VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from './_contracts.js'
import { enforceVideoStudioRateLimit } from './_data.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorRead(req, res, ['GET'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:session', videoStudioOperatorIdentity(req), 60, 60)) return

  const csrf = issueVideoStudioCsrfToken(req)
  if (!csrf) return sendVideoStudioError(res, 503, 'operator_auth_unconfigured')
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    csrf_token: csrf.token,
    expires_at: csrf.expiresAt,
  })
}
