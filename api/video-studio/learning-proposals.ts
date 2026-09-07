import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  guardVideoStudioOperatorMutation,
  guardVideoStudioOperatorRead,
  videoStudioOperatorIdentity,
} from '../_videoStudioAuth.js'
import { VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from './_contracts.js'
import { enforceVideoStudioRateLimit } from './_data.js'

// GET  /api/video-studio/learning-proposals            the open proposals
// POST /api/video-studio/learning-proposals            { id, decision }
//
// What the Studio has learned and wants confirmed. The MCP gateway writes
// mindmake_studio_learning_proposals every week; until this route nothing read
// them back, so the learning loop recorded and never applied. A decision here
// is Krish's ruling on one assertion. Approval does not change any engine
// configuration on its own: the studio's activation boundary is a reviewed
// Git commit (docs/ENGINE_SESSION.md), and the proposal row is the receipt.

const DECISIONS = new Set(['approved', 'rejected'])
const PROPOSAL_FIELDS = 'id, weekly_batch_id, proposal_class, assertion, scope, independent_session_count, independent_job_count, counterexamples, regression_cases, proposed_change, status, created_at'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    if (guardVideoStudioOperatorRead(req, res, ['GET'])) return
    if (await enforceVideoStudioRateLimit(res, 'operator:learning:list', videoStudioOperatorIdentity(req), 120, 60)) return
    const { data, error } = await supabase
      .from('mindmake_studio_learning_proposals')
      .select(PROPOSAL_FIELDS)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return sendVideoStudioError(res, 503, 'learning_store_unavailable')
    return res.status(200).json({
      ok: true,
      schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
      proposals: data || [],
      server_time: new Date().toISOString(),
    })
  }

  if (guardVideoStudioOperatorMutation(req, res, ['POST'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:learning:decide', videoStudioOperatorIdentity(req), 60, 60)) return
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  const decision = typeof body.decision === 'string' ? body.decision : ''
  if (!/^[0-9a-f-]{36}$/.test(id)) return sendVideoStudioError(res, 400, 'invalid_id')
  if (!DECISIONS.has(decision)) return sendVideoStudioError(res, 400, 'invalid_decision')

  // Only an open proposal can be decided, and only once. The filter on status
  // makes a replayed tap a no-op instead of a second decision.
  const { data, error } = await supabase
    .from('mindmake_studio_learning_proposals')
    .update({ status: decision, decided_at: new Date().toISOString(), decided_by: 'Krish' })
    .eq('id', id)
    .eq('status', 'proposed')
    .select('id, status')
  if (error) return sendVideoStudioError(res, 503, 'learning_store_unavailable')
  if (!data?.length) return sendVideoStudioError(res, 409, 'already_decided')
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    proposal: data[0],
    server_time: new Date().toISOString(),
  })
}
