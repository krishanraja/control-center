import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { join } from 'path'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const { name } = req.query
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'agent name required' })
  }

  const agentName = name.toLowerCase()
  const briefPath = join(process.cwd(), 'public', 'data', 'agent-briefs', `${agentName}.json`)

  try {
    const briefData = JSON.parse(readFileSync(briefPath, 'utf8'))
    return res.json({
      success: true,
      agent: briefData.agent,
      brief_file: briefData.file,
      updated_at: briefData.updated_at,
      content: briefData.content,
      source: 'control-center',
      synced_at: new Date().toISOString()
    })
  } catch (error) {
    return res.status(404).json({
      error: `Agent brief not found: ${agentName}`,
      available_agents: [
        'arlo', 'cleo', 'felix', 'leo', 'marcus', 'maya', 'nell', 'nova', 'priya', 'vera', 'zara'
      ]
    })
  }
}
