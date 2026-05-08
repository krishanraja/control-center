/**
 * Skill Forge — shared LLM prompt, quality gate, and ZIP assembly.
 *
 * Used by /api/skills/generate and /api/skills/ship. Imports between
 * api/* files MUST use the .js extension (ESM rule from CLAUDE.md).
 */

export const SKILL_BUILDER_SYSTEM_PROMPT = `You are an expert Agent Skill architect. Your job is to take a leader's voice
transcript about a repetitive workflow and convert it into one or more
production-ready Agent Skills that follow the agentskills.io open standard.

You will receive:
1. TRANSCRIPT: The leader's raw voice description of their workflow.
2. CLIENT_NAME: Identifier for the client these skills are being built for.
3. ADDITIONAL_CONTEXT (optional): Extra notes, docs, or background pasted by the operator.

## PHASE 1: TRIAGE

Before generating anything, apply the Three Honest Tests:

1. REPEATABLE: Is this work done at least weekly? Look for: "every Monday",
   "whenever I", "each time", "always have to", frequency markers.
2. SPECIALISED: Would generic Claude get this materially wrong without guidance?
   Look for: unusual formatting rules, domain-specific constraints, tool-specific
   workflows, preferences that contradict AI defaults.
3. BOUNDED: Can you describe when to use it in one or two sentences?
   If the transcript describes multiple unrelated tasks, split them into
   separate skills (one entry per skill in the output array).

If ANY test fails for the WHOLE transcript, return a triage failure:
{
  "triage": {
    "passed": false,
    "result": "custom_instruction" | "memory_fact" | "saved_style",
    "reasoning": "[why it failed and what it should be instead]"
  },
  "skills": []
}

If at least one workflow passes, continue to Phase 2 and emit one skill per
distinct workflow in the transcript.

## PHASE 2: EXTRACT AND GENERATE

For each skill:

### 2A: Name
- lowercase-hyphenated, max 64 chars
- Use gerund form when natural (e.g., "writing-board-updates")
- Must be descriptive, not vague (never "helper", "utils", "tools")

### 2B: Description (THIS IS 80% OF THE SKILL)
The description determines whether Claude triggers the skill. Rules:

1. First sentence: what the skill does (one clear sentence).
2. List 5+ trigger phrases using the leader's ACTUAL language from the transcript.
   Include casual phrasings, partial requests, adjacent topics.
   "Use whenever [phrase 1], [phrase 2], [phrase 3], [phrase 4], or [phrase 5]."
3. Include push language: "Do not [produce X] without consulting this skill first."
   or "Use whenever [context]. If in doubt, use the skill."
4. Write in THIRD PERSON ("Generates board updates" not "I generate board updates").
5. Stay under 1024 characters.

### 2C: Body (SKILL.md markdown content — NOT including the YAML frontmatter)

1. IMPERATIVE VOICE: "Use pdfplumber" not "You should use pdfplumber".
2. EXPLAIN WHY, NOT JUST WHAT: Transform every stated preference into reasoning.
   - BAD: "NEVER use bullet points"
   - GOOD: "Avoid bullet points. The audience reads this as a continuous narrative,
     and bullets fragment the argument."
3. NO BRITTLE MUST/NEVER WITHOUT EXPLANATION: If a hard rule exists, explain WHY.
4. LEAN: Under 500 lines. Push detail into references/.
5. EXTRACT, DON'T INVENT: Every rule must trace back to something the leader said.
6. DO NOT RESTATE THE DESCRIPTION.

Required sections in the body, in this order:
- "## When this skill activates" (operational context, not trigger restatement)
- "## Workflow" (numbered steps with reasoning)
- "## Gotchas" (specific corrections to mistakes the agent will make)
- "## Output format" (template or structural guide)
- "## References" (pointers to bundled files with clear "read this WHEN [condition]")

### 2D: References
Split heavy context into separate files:
- company-context.md: Business facts (only those relevant to this skill).
- format-rules.md: Formatting preferences extracted from the transcript.
- [domain].md: Any domain-specific reference needed.

Each reference file should have a clear scope. The agent loads them on demand.

### 2E: Test Prompts
Generate exactly 3 realistic test prompts. They must be:
- MESSY: Include typos, casual phrasing, backstory, partial information.
- REALISTIC: The way a real person types at 9am on Monday.
- VARIED: Cover different angles of the same workflow.

### 2F: Archetype
Classify into one of:
decision-framework | voice-lock | reporting-engine | tool-integration | getting-started

## PHASE 3: OUTPUT FORMAT

Return ONLY valid JSON, no surrounding prose or markdown fencing:
{
  "triage": {
    "passed": true,
    "result": "skill",
    "reasoning": "[why it qualifies]"
  },
  "skills": [
    {
      "name": "lowercase-hyphenated",
      "description": "full description with triggers and push language",
      "body": "full SKILL.md markdown body — NOT including the YAML frontmatter",
      "references": [
        { "filename": "company-context.md", "content": "markdown content" },
        { "filename": "format-rules.md", "content": "markdown content" }
      ],
      "test_prompts": ["messy prompt 1", "messy prompt 2", "messy prompt 3"],
      "gotchas": ["gotcha 1", "gotcha 2"],
      "archetype": "decision-framework"
    }
  ]
}

When generating multiple skills from one transcript, ensure their description
trigger phrases do not overlap — each skill must own a distinct trigger surface.`

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillReference {
  filename: string
  content: string
}

export interface SkillData {
  name: string
  description: string
  body: string
  references: SkillReference[]
  test_prompts: string[]
  gotchas: string[]
  archetype: string
}

export interface TriageResult {
  passed: boolean
  result: string
  reasoning: string
}

export interface QualityCheck {
  id: string
  label: string
  pass: boolean
  detail?: string
}

export interface QualityGateResult {
  skill_name: string
  passed: number
  total: number
  checks: QualityCheck[]
}

// ---------------------------------------------------------------------------
// Quality gate (Section 7 of the spec)
// ---------------------------------------------------------------------------

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const FIRST_PERSON_RE = /\b(I can|I will|we can|we will|you can|you will)\b/i
const HEDGING_RE = /\byou should\b|\bit might be helpful\b|\bconsider using\b/i
const PUSH_RE = /use whenever|do not [a-z]+ without|if in doubt, use|consult this skill/i
const TRIGGER_LIST_RE = /use whenever ([^.]+)\.|triggers? on ([^.]+)\./i

function countTriggerPhrases(description: string): number {
  const m = description.match(TRIGGER_LIST_RE)
  if (!m) return 0
  const list = (m[1] || m[2] || '').replace(/\bor\b/gi, ',')
  return list.split(',').map(s => s.trim()).filter(Boolean).length
}

export function runQualityGate(skill: SkillData): QualityGateResult {
  const checks: QualityCheck[] = []
  const desc = skill.description || ''
  const body = skill.body || ''

  // Description checks
  checks.push({
    id: 'desc_under_1024',
    label: 'Description under 1024 characters',
    pass: desc.length > 0 && desc.length < 1024,
    detail: `${desc.length} chars`,
  })

  const triggerCount = countTriggerPhrases(desc)
  checks.push({
    id: 'desc_5_triggers',
    label: '5+ trigger phrases',
    pass: triggerCount >= 5,
    detail: `${triggerCount} detected`,
  })

  checks.push({
    id: 'desc_push_language',
    label: 'Push language present',
    pass: PUSH_RE.test(desc),
    detail: PUSH_RE.test(desc) ? '' : 'Add "use whenever..." or "do not X without consulting this skill"',
  })

  checks.push({
    id: 'desc_third_person',
    label: 'Third-person voice',
    pass: !FIRST_PERSON_RE.test(desc),
    detail: FIRST_PERSON_RE.test(desc) ? 'Found first/second person' : '',
  })

  // Body checks
  const lineCount = body.split(/\r?\n/).length
  checks.push({
    id: 'body_under_500_lines',
    label: 'Body under 500 lines',
    pass: lineCount < 500,
    detail: `${lineCount} lines`,
  })

  checks.push({
    id: 'body_imperative',
    label: 'Imperative voice (no hedging)',
    pass: !HEDGING_RE.test(body),
    detail: HEDGING_RE.test(body) ? 'Found hedging phrase' : '',
  })

  checks.push({
    id: 'body_gotchas',
    label: 'Gotchas section present',
    pass: /^##\s+Gotchas\b/im.test(body),
  })

  checks.push({
    id: 'body_output_format',
    label: 'Output format section present',
    pass: /^##\s+Output format\b/im.test(body),
  })

  checks.push({
    id: 'body_references',
    label: 'References section present',
    pass: /^##\s+References\b/im.test(body),
  })

  // No brittle MUST/NEVER without reasoning. We flag bare uses (sentence ends
  // immediately after the rule with no follow-up explanation in the same paragraph).
  const brittle = body.match(/\b(MUST|NEVER)\b[^.\n]*\.\s*(?=\n\n|\n##|$)/g) || []
  checks.push({
    id: 'body_no_brittle_rules',
    label: 'No bare MUST/NEVER without reasoning',
    pass: brittle.length === 0,
    detail: brittle.length ? `${brittle.length} bare rule(s)` : '',
  })

  // Body shouldn't restate the description (compare first 200 chars after first heading)
  const firstSection = body.replace(/^#[^\n]*\n+/, '').slice(0, 240).toLowerCase()
  const descHead = desc.slice(0, 240).toLowerCase()
  const overlap = jaccard(firstSection, descHead)
  checks.push({
    id: 'body_no_desc_restatement',
    label: "Body doesn't restate description",
    pass: overlap < 0.7,
    detail: overlap >= 0.7 ? `${Math.round(overlap * 100)}% similarity` : '',
  })

  // Package checks
  checks.push({
    id: 'name_valid',
    label: 'Name is lowercase-hyphenated, max 64 chars',
    pass: NAME_RE.test(skill.name) && skill.name.length <= 64,
    detail: skill.name,
  })

  const allText = body + skill.references.map(r => r.content).join('')
  checks.push({
    id: 'no_backslash_paths',
    label: 'No backslash paths',
    pass: !/\\[a-zA-Z0-9_-]/.test(allText),
  })

  checks.push({
    id: 'three_test_prompts',
    label: '3 test prompts generated',
    pass: Array.isArray(skill.test_prompts) && skill.test_prompts.length === 3,
    detail: `${skill.test_prompts?.length || 0} prompts`,
  })

  const passed = checks.filter(c => c.pass).length
  return { skill_name: skill.name, passed, total: checks.length, checks }
}

function jaccard(a: string, b: string): number {
  const ta = new Set(a.split(/\W+/).filter(Boolean))
  const tb = new Set(b.split(/\W+/).filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

// ---------------------------------------------------------------------------
// SKILL.md assembly
// ---------------------------------------------------------------------------

export function buildSkillMd(skill: SkillData, clientName: string): string {
  const yamlDesc = skill.description
    .replace(/\r/g, '')
    .split('\n')
    .map(l => '  ' + l)
    .join('\n')
  const frontmatter = [
    '---',
    `name: ${skill.name}`,
    'description: >',
    yamlDesc,
    'license: Proprietary. Built by Mindmaker (themindmaker.ai).',
    'compatibility: Designed for Claude Code, Claude.ai, and compatible agent platforms.',
    'metadata:',
    '  author: mindmaker',
    '  version: "1.0"',
    `  client: ${slugify(clientName)}`,
    `  archetype: ${skill.archetype}`,
    '---',
    '',
  ].join('\n')
  return frontmatter + skill.body.replace(/^\s+/, '')
}

function slugify(s: string): string {
  return (s || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'client'
}

// ---------------------------------------------------------------------------
// Static text bundled in every ZIP
// ---------------------------------------------------------------------------

export function testPromptsTxt(prompts: string[]): string {
  const lines = ['SKILL TEST PROMPTS', '==================', '',
    'Open a fresh chat with Claude (web, desktop, or Claude Code) and try each',
    'of these prompts. The skill should activate automatically. If it doesn\'t,',
    'check that Code Execution is on (Claude.ai) or that the skill is installed',
    'at ~/.claude/skills/ (Claude Code).', '']
  prompts.forEach((p, i) => {
    lines.push(`--- Prompt ${i + 1} ---`)
    lines.push(p)
    lines.push('')
  })
  return lines.join('\n')
}

export const MAINTENANCE_CARD_TXT = `SKILL MAINTENANCE CARD
=======================

Run this audit quarterly. The skill stays useful only if it tracks how the
work actually changes.

[ ] The trigger phrases still match how you describe this task today
[ ] The "Gotchas" section still reflects the mistakes Claude actually makes
[ ] References/ files (company-context.md, format-rules.md) are still accurate
[ ] No new tools, formats, or audiences have entered this workflow
[ ] You ran the 3 test prompts in 01-test-prompts.txt and the output passed

If any item fails, regenerate the skill from a fresh transcript via Mindmaker
Control Center > Flows > Skill Forge.
`

export const INSTALL_GUIDE_TXT = `AGENT SKILL INSTALLATION GUIDE
===============================

FOR CLAUDE CODE (Recommended):
1. Open your terminal
2. Run: unzip [skill-name].zip -d ~/.claude/skills/
3. Done. The skill activates automatically in your next Claude Code session.

FOR CLAUDE.AI (Web):
1. Go to claude.ai and sign in
2. Click your profile icon > Settings
3. Go to Capabilities
4. Make sure "Code execution and file creation" is ON
5. Scroll to Skills > click "Upload skill"
6. Select this ZIP file
7. Done. The skill activates automatically when you describe a matching task.

FOR CURSOR:
1. Unzip this file into your project's .claude/skills/ directory
2. The skill will be available in your next Cursor session.

TESTING YOUR SKILL:
Open a new conversation and try one of the test prompts in 01-test-prompts.txt.
The skill should activate automatically. If it doesn't, check that the task
description matches the skill's trigger phrases.
`

// ---------------------------------------------------------------------------
// Minimal ZIP encoder (STORE method, no compression — good enough for text)
// Avoids adding a dependency. Produces a valid PKZIP archive.
// ---------------------------------------------------------------------------

interface ZipEntry {
  path: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f)
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f)
  return { time, date }
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const enc = new TextEncoder()
  const now = new Date()
  const { time, date } = dosTime(now)

  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.path)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header
    const lh = new Uint8Array(30 + nameBytes.length)
    const lhView = new DataView(lh.buffer)
    lhView.setUint32(0, 0x04034b50, true)
    lhView.setUint16(4, 20, true) // version
    lhView.setUint16(6, 0, true) // flags
    lhView.setUint16(8, 0, true) // method: store
    lhView.setUint16(10, time, true)
    lhView.setUint16(12, date, true)
    lhView.setUint32(14, crc, true)
    lhView.setUint32(18, size, true)
    lhView.setUint32(22, size, true)
    lhView.setUint16(26, nameBytes.length, true)
    lhView.setUint16(28, 0, true)
    lh.set(nameBytes, 30)
    local.push(lh, entry.data)

    // Central directory record
    const ch = new Uint8Array(46 + nameBytes.length)
    const chView = new DataView(ch.buffer)
    chView.setUint32(0, 0x02014b50, true)
    chView.setUint16(4, 20, true) // version made by
    chView.setUint16(6, 20, true) // version needed
    chView.setUint16(8, 0, true)
    chView.setUint16(10, 0, true)
    chView.setUint16(12, time, true)
    chView.setUint16(14, date, true)
    chView.setUint32(16, crc, true)
    chView.setUint32(20, size, true)
    chView.setUint32(24, size, true)
    chView.setUint16(28, nameBytes.length, true)
    chView.setUint16(30, 0, true)
    chView.setUint16(32, 0, true)
    chView.setUint16(34, 0, true)
    chView.setUint16(36, 0, true)
    chView.setUint32(38, 0, true)
    chView.setUint32(42, offset, true)
    ch.set(nameBytes, 46)
    central.push(ch)

    offset += lh.length + entry.data.length
  }

  const centralSize = central.reduce((s, b) => s + b.length, 0)
  const centralOffset = offset

  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(4, 0, true)
  eocdView.setUint16(6, 0, true)
  eocdView.setUint16(8, entries.length, true)
  eocdView.setUint16(10, entries.length, true)
  eocdView.setUint32(12, centralSize, true)
  eocdView.setUint32(16, centralOffset, true)
  eocdView.setUint16(20, 0, true)

  const totalLen = local.reduce((s, b) => s + b.length, 0) + centralSize + eocd.length
  const out = Buffer.alloc(totalLen)
  let pos = 0
  for (const b of local) { out.set(b, pos); pos += b.length }
  for (const b of central) { out.set(b, pos); pos += b.length }
  out.set(eocd, pos)
  return out
}

export function assembleSkillZip(skills: SkillData[], clientName: string): Buffer {
  const enc = new TextEncoder()
  const entries: ZipEntry[] = []

  for (const skill of skills) {
    const root = skill.name
    const skillMd = buildSkillMd(skill, clientName)
    entries.push({ path: `${root}/SKILL.md`, data: enc.encode(skillMd) })
    for (const ref of skill.references || []) {
      entries.push({
        path: `${root}/references/${ref.filename}`,
        data: enc.encode(ref.content),
      })
    }
    entries.push({
      path: `${root}/01-test-prompts.txt`,
      data: enc.encode(testPromptsTxt(skill.test_prompts || [])),
    })
    entries.push({
      path: `${root}/02-maintenance-card.txt`,
      data: enc.encode(MAINTENANCE_CARD_TXT),
    })
    entries.push({
      path: `${root}/03-install-guide.txt`,
      data: enc.encode(INSTALL_GUIDE_TXT),
    })
  }

  return buildZip(entries)
}

// ---------------------------------------------------------------------------
// LLM call (OpenAI Chat Completions with JSON mode). Falls back to a
// deterministic stub when no API key is configured so local dev still works.
// ---------------------------------------------------------------------------

export interface GenerateResponse {
  triage: TriageResult
  skills: SkillData[]
}

export async function callSkillLLM(input: {
  transcript: string
  client_name: string
  additional_context?: string
}): Promise<GenerateResponse> {
  const key = process.env.OPENAI_API_KEY
  const userMsg = [
    `CLIENT_NAME: ${input.client_name}`,
    '',
    'TRANSCRIPT:',
    input.transcript,
    input.additional_context ? `\nADDITIONAL_CONTEXT:\n${input.additional_context}` : '',
  ].join('\n')

  if (!key) {
    // Deterministic stub for local dev. Real production must set OPENAI_API_KEY.
    return stubResponse(input)
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [
        { role: 'system', content: SKILL_BUILDER_SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`)
  }
  const json: any = await resp.json()
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty content')
  let parsed: any
  try { parsed = JSON.parse(content) } catch (e) {
    throw new Error('Model did not return valid JSON')
  }
  return {
    triage: parsed.triage || { passed: false, result: 'unknown', reasoning: 'no triage' },
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
  }
}

function stubResponse(input: { transcript: string; client_name: string }): GenerateResponse {
  const name = 'sample-skill-' + (Date.now() % 1000)
  const skill: SkillData = {
    name,
    description:
      'Generates the leader\'s recurring artifact from raw inputs. Use whenever drafting the weekly update, preparing the board memo, summarising sales chatter, writing the investor note, or composing the monthly recap. Triggers on "draft the update", "board memo time", or "pull together the weekly". Do not produce these artifacts without consulting this skill first.',
    body: `## When this skill activates\nThe leader is preparing a recurring artifact and the inputs are scattered across chat and notes.\n\n## Workflow\n1. **Collect inputs** - Gather the source notes from the leader's stated channels. Skipping this step produces a generic summary that misses pipeline movement.\n2. **Apply the leader's structure** - Follow the order in references/format-rules.md. Investors expect this order; reordering buries the headline.\n3. **Draft in flowing paragraphs** - Bullets fragment the argument for this audience.\n\n## Gotchas\n- Avoid bullets in the executive summary. The audience reads this end-to-end and bullets break the narrative thread.\n- Do not invent metrics. If a number is missing, mark it [TBD] rather than guessing.\n\n## Output format\n\n\`\`\`\nExecutive summary (2-3 sentences)\nPipeline changes (paragraph)\nRisks (paragraph)\n\`\`\`\n\n## References\n- Read [references/company-context.md](references/company-context.md) for the client's business facts when filling in company-specific details.\n- Read [references/format-rules.md](references/format-rules.md) when formatting the final output.\n`,
    references: [
      { filename: 'company-context.md', content: `# Company context\n\nClient: ${input.client_name}\n\n(Stub content - configure OPENAI_API_KEY to generate real references.)\n` },
      { filename: 'format-rules.md', content: `# Format rules\n\n- Flowing paragraphs, no bullets in summary.\n- Order: summary, pipeline, risks.\n` },
    ],
    test_prompts: [
      'ok so my sales team just posted their updates in slack and I need to get the board update done before my 10am. the usual format - pipeline is looking rough this week tbh. can you pull it together?',
      'monday again. need the weekly. notes are in the doc. keep it tight investors hate fluff',
      'draft the investor note for me, last week was mixed - leo signed but the enterprise deal slipped',
    ],
    gotchas: [
      'No bullets in executive summary',
      'Do not fabricate numbers',
    ],
    archetype: 'reporting-engine',
  }
  return {
    triage: { passed: true, result: 'skill', reasoning: 'Stub response (no OPENAI_API_KEY set)' },
    skills: [skill],
  }
}

export function emailHtml(input: {
  client_name: string
  skills: SkillData[]
  drive_url?: string
}): string {
  const skillBlocks = input.skills.map(s => {
    const prompts = (s.test_prompts || []).map(p => `<li style="margin-bottom:8px">${escapeHtml(p)}</li>`).join('')
    return `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px">
        <h3 style="margin:0 0 8px;font-size:16px">${escapeHtml(s.name)}</h3>
        <p style="margin:0 0 12px;color:#4b5563;font-size:13px">${escapeHtml((s.description || '').slice(0, 220))}…</p>
        <p style="margin:0 0 6px;font-weight:600;font-size:12px;color:#374151">Try these prompts</p>
        <ol style="margin:0 0 0 18px;padding:0;color:#374151;font-size:13px">${prompts}</ol>
      </div>`
  }).join('')

  const driveLink = input.drive_url
    ? `<p><a href="${input.drive_url}">Download the skill ZIP</a></p>`
    : '<p>The skill ZIP is attached to this email.</p>'

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:640px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 4px">Your custom AI skills, ${escapeHtml(input.client_name)}.</h2>
<p style="color:#6b7280;margin:0 0 20px">Built from your workflow by Mindmaker.</p>
${skillBlocks}
${driveLink}
<h3 style="margin-top:24px">Install</h3>
<p style="color:#374151;font-size:13px"><strong>Claude.ai</strong>: Settings &rarr; Capabilities &rarr; Skills &rarr; Upload skill, then select the ZIP.</p>
<p style="color:#374151;font-size:13px"><strong>Claude Code</strong>: <code>unzip your-skill.zip -d ~/.claude/skills/</code></p>
<p style="color:#374151;font-size:13px"><strong>Cursor</strong>: unzip into your project's <code>.claude/skills/</code> folder.</p>
<p style="color:#9ca3af;font-size:12px;margin-top:24px">Mindmaker · themindmaker.ai</p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
