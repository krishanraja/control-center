// _humor — the humour engine for the Content composer's "Humor" adjust chips.
// Humour is hard, and a one-line "be sarcastic" steer buried in the general
// rewriter does not produce it. Each register here carries a real definition,
// the craft mechanisms behind it, a worked before->after example, and the
// failure modes to avoid — all calibrated to a dry British/Australian
// sensibility (Krish's). The /revise route swaps in buildHumourSystem() for
// humour passes, relaxes the "hard verdict" rule, runs hotter, and uses a
// stronger model.

export const HUMOUR_REGISTERS = ['witty', 'sarcastic', 'absurd', 'satirical', 'deadpan', 'periodic'] as const
export type HumourRegister = typeof HUMOUR_REGISTERS[number]

export function isHumourRegister(v?: string | null): v is HumourRegister {
  return !!v && (HUMOUR_REGISTERS as readonly string[]).includes(v)
}

// The shared sensibility every register inherits.
export const BRIT_AUS_HUMOUR = `BRITISH / AUSTRALIAN COMIC REGISTER (the sensibility for this whole pass):
- Dry, deadpan, understated. The comedy lives in restraint and in what you leave unsaid, never in trying hard.
- Reach for irony, litotes (understatement by negation: "not exactly a triumph"), bathos (deflate the grand with the mundane), mock-formality, and the withering aside in parentheses.
- Self-deprecation over showing off. Undercut your own setup before anyone else can.
- Aim every barb at hype, marketing, trends, institutions, or yourself. Never punch down at a person or group (this keeps the "Kind" standard).
- One clean landing beats three jokes. Cut the second punchline.

NOT this (the American open-mic register) — avoid entirely:
- Exclamation marks, "literally", hot-take energy, "lol", emoji.
- Explaining or signposting the joke ("see what I did there", "the irony being").
- Zany randomness or pun-stacking (unless the register is explicitly absurd).
- Wackiness for its own sake. Stay grounded in the real argument.`

export interface HumourEntry { label: string; def: string; craft: string; examples: string; avoid: string }

export const HUMOUR_GUIDE: Record<HumourRegister, HumourEntry> = {
  sarcastic: {
    label: 'Sarcastic',
    def: 'Say the opposite of what you mean with a straight face; praise the daft thing in mock-earnest so the gap between the words and the truth does the work.',
    craft: 'Set up the real point, then voice the lazy or complacent take as if you agreed with it, deadpan. Let the reader feel the eye-roll without you performing it. A short faux-concession ("but sure", "nothing to see here") lands the irony.',
    examples: `before: "A solo dev shipped a full speech-infra layer with a local/cloud toggle. That should stop you cold."
after: "A solo dev shipped a full speech stack with a local/cloud toggle this week. Nothing to see here, obviously. Just one person doing what a forty-strong platform team spent two years not finishing. But sure, the AI thing is overblown."`,
    avoid: 'Do not turn bitter or aim it at people. Sarcasm at the hype, not at the reader. No caps-lock "oh wow, GENIUS" energy.',
  },
  deadpan: {
    label: 'Deadpan',
    def: 'State something absurd or pointed completely flatly, with zero emotional cue, so the flatness itself is the joke.',
    craft: 'Report the extraordinary in the register of the mundane. No adjectives doing the laughing for you. Let one plain sentence sit next to an absurd fact and leave it there.',
    examples: `before: "Costs collapsed and now basically anyone can build this."
after: "The cost fell about ninety-nine percent. People reacted the way they react to most miracles now, which is to say they asked whether there was an API."`,
    avoid: 'No wink, no "and that, folks, is", no build-up. The moment you flag it as a joke it stops being deadpan.',
  },
  witty: {
    label: 'Witty',
    def: 'Quick, intelligent turns of phrase: a clever reframe, an unexpected but apt comparison, economy that rewards a sharp reader.',
    craft: 'Compress two ideas into one sharp line. Find the analogy that reframes the point. Precision is the joke; if it needs a second sentence to explain, cut it.',
    examples: `before: "The tools got cheap, so the old advantages stopped mattering."
after: "The moat drained overnight, and a lot of people are still standing in it, explaining why it is a moat."`,
    avoid: 'No groan-puns, and no quip that does not also advance the argument.',
  },
  absurd: {
    label: 'Absurd',
    def: 'Take one real premise and follow its logic to a ridiculous but revealing extreme, committing to the bit fully.',
    craft: 'Pick the load-bearing assumption and extrapolate it past the point of sense, then land back on the real point. The absurdity should expose a truth, not just be weird.',
    examples: `before: "Soon every app will have an assistant bolted on."
after: "At the current rate the toaster will have a copilot by spring, and it will ask, gently, whether you have considered a more strategic approach to bread."`,
    avoid: 'Random for the sake of random. Keep it anchored to the argument and bring it home.',
  },
  satirical: {
    label: 'Satirical',
    def: 'A deadpan, mock-serious column voice that reports an absurd premise with total straight-faced gravity, in the style of a satirical periodical.',
    craft: 'Adopt the cadence of earnest reportage or an institutional memo, then let the content be quietly ludicrous. The humour is in the mismatch between the solemn frame and the silly truth.',
    examples: `before: "Companies keep announcing AI strategies that are mostly press releases."
after: "Sources close to the matter confirm the company has a bold AI strategy, the centrepiece of which is having announced one."`,
    avoid: 'Breaking the straight face. No nudging the reader. Keep the formal frame intact throughout.',
  },
  periodic: {
    label: 'Periodic',
    def: 'Use periodic sentences that withhold the payoff until the final clause, so each line lands on timing.',
    craft: 'Stack the qualifying clauses first and hold the verb or the point to the end. The delay is the comedy; the last word should snap.',
    examples: `before: "This took a huge team and ages, but now one person does it in a weekend."
after: "What once took a chartered team, a procurement cycle, two reorgs and the better part of a fiscal year, one person now does, mildly bored, on a Sunday."`,
    avoid: 'Run-ons that lose the thread. Build, hold, then deliver; do not ramble.',
  },
}

// Humour-pass guardrails: keep the hard voice rules but DROP the "end on a hard
// verdict / no rhetorical question" rule, which flattens comedy.
export const HUMOUR_GUARDRAILS = [
  'HARD RULES (never violate): No em dashes anywhere, use commas, periods, or parentheses.',
  'No AI tells ("here\'s the thing", "the truth is", "let\'s dive in", "delve", "unpack", "deep dive").',
  'No synthetic enthusiasm, no "leverage", "utilise", "seamless", "empower", "journey", "landscape", "robust", "synergy".',
  'Never invent facts, numbers, names, or quotes. The humour is in the delivery, not in made-up specifics.',
  'Aim the humour at hype, situations, or yourself, never at a person or group (the Kind standard).',
].join('\n')

/** Build the system prompt for a humour pass on one register. */
export function buildHumourSystem(o: {
  register: string
  voice: string
  channelCorpus: string
  materialsBlock: string
}): string {
  const entry = HUMOUR_GUIDE[o.register as HumourRegister] || HUMOUR_GUIDE.witty
  const corpusBlock = o.channelCorpus
    ? `\n\nCHANNEL CONTEXT (audience and bar, for grounding — do not let it flatten the comedy):\n${o.channelCorpus}`
    : ''
  return [
    "You are Cleo, rewriting a passage of Krish Raja's draft. Krish is a British-Australian founder-operator in Brooklyn. This is a HUMOUR pass.",
    '',
    o.voice ? `VOICE REFERENCE:\n${o.voice}` : '',
    '',
    BRIT_AUS_HUMOUR,
    '',
    `TARGET REGISTER: ${entry.label}.`,
    `What it is: ${entry.def}`,
    `How to do it: ${entry.craft}`,
    `Worked example (study the shift, do not reuse the content):\n${entry.examples}`,
    `Avoid: ${entry.avoid}`,
    corpusBlock,
    '',
    HUMOUR_GUARDRAILS,
    o.materialsBlock,
    '',
    `Rewrite the passage so it reads as genuinely ${entry.label.toLowerCase()}, in the dry British/Australian register above. Keep every fact and the core argument intact; change only the delivery. Hold roughly the same length. Return ONLY the rewritten text — no preamble, no explanation, no quotes around it.`,
  ].filter(Boolean).join('\n')
}

// ── The play block, for prompts that PROPOSE work ───────────────────────────
//
// Everything above runs on text that already exists: Krish presses a Humor
// chip and the passage comes back funnier. Nothing above ever touches the
// prompts that hand him work to do, and that is the whole problem with how the
// OS reads (Krish, 2026-09-13: "the content suggestions are so serious and
// intense").
//
// Look at what a proposal prompt is made of. `growth/clip-ideas` carried one
// sentence about what a good title is and then fifteen prohibitions: never
// invent, no em dashes, no exclamation marks, no colons, no "the truth about",
// no "deep dive". Every one of those rules is right and none of them asks for
// anything. A model given a wall of bans and a single flat instruction returns
// exactly what it was asked for: correct, safe, joyless work, every time, and
// a list of five of those is not something anyone opens twice.
//
// So this block is the missing half. It says what to reach FOR, not only what
// to avoid, and it spends one of every batch on a real swing. The swing is the
// point: four grounded proposals and one that made him laugh is a list he will
// come back to, and habit is the thing being built here, not compliance.
//
// It never relaxes a truth rule. The wildcard is a different ANGLE on the same
// evidence, never a different set of facts.

export const PROPOSAL_PLAY = `THE REGISTER (this is what makes a list worth opening):
- Write these the way you would say them to a smart friend at a bar, not the way you would file them. Specific beats sweeping. A real number, a real name, a real moment.
- Dry, deadpan, British/Australian. Understatement lands harder than emphasis. The joke, where there is one, is in the restraint.
- Have a POINT OF VIEW. A proposal that could have come from anyone is worse than one that is arguably wrong. Take the side.
- Aim any barb at hype, at institutions, at the work, or at yourself. Never at a person or a group.
- Be interesting first. If a line is accurate and dull, it has failed the brief. Dull is the failure mode here, not wrong.

THE WILDCARD (exactly one per batch):
- Make ONE of these a genuine swing: the angle nobody else would propose, the contrarian read, the joke that happens to be true, the one you would be slightly nervous to publish.
- Mark it with "play": true. Every other proposal has "play": false.
- The wildcard obeys every truth rule above it. It is a different ANGLE on the same evidence, never different evidence. Do not invent a number, a person or an outcome to make it land.
- If a swing would need a fact you were not given, do not take it. Return the batch with no wildcard rather than a made-up one.`

/** The play block plus one line naming the batch size, for a proposal prompt. */
export function proposalPlay(count: number): string {
  return `${PROPOSAL_PLAY}\n- Of the ${count} proposals, exactly one carries "play": true.`
}
