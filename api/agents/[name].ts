import type { VercelRequest, VercelResponse } from '@vercel/node'
import { execSync } from 'child_process'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const { name } = req.query
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'agent name required' })
  }

  const agentName = name.toLowerCase()

  // Read agent brief index from workspace
  try {
    const output = execSync(
      `cat /root/.openclaw/workspace/active/agent-briefs-index.json 2>/dev/null`,
      { encoding: 'utf8' }
    )
    const briefs = JSON.parse(output)

    if (!briefs[agentName]) {
      return res.status(404).json({ error: `agent not found: ${agentName}` })
    }

    const brief = briefs[agentName]

    // Return brief with metadata
    return res.json({
      success: true,
      agent: brief.agent,
      brief_file: brief.file,
      updated_at: brief.updated,
      content: brief.brief_content,
      content_hash: brief.content_hash,
      source: 'workspace',
      synced_at: new Date().toISOString()
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch agent brief',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
