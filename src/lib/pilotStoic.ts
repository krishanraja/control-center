// A line for the state the operator is actually in.
//
// Curated and static on purpose. This sits on the critical path of the gate,
// and the gate must never wait on a network call or fail because a model was
// slow. A fixed library is instant, works offline, costs nothing, and cannot
// hallucinate an attribution.
//
// Tone rules, same as the rest of the layer: no reassurance, no motivational
// language, no exclamation marks. The Stoics are useful here precisely because
// they are unsentimental. Each entry carries a `so` line, which is the
// practical instruction, not encouragement.

export interface StoicLine {
  quote: string
  source: string
  /** What to do with it today. One sentence, directive, never cheerful. */
  so: string
}

export type StateBucket =
  | 'depleted_calm'
  | 'depleted_anxious'
  | 'steady'
  | 'strong_anxious'
  | 'strong_calm'

/** Which bucket a reading falls into. */
export function bucketFor(energy: number, anxiety: number): StateBucket {
  const low = energy <= 2
  const high = energy >= 4
  const anxious = anxiety >= 4
  if (low && anxious) return 'depleted_anxious'
  if (low) return 'depleted_calm'
  if (high && anxious) return 'strong_anxious'
  if (high) return 'strong_calm'
  return 'steady'
}

const LIBRARY: Record<StateBucket, StoicLine[]> = {
  depleted_anxious: [
    {
      quote: 'We suffer more often in imagination than in reality.',
      source: 'Seneca',
      so: 'The dread is doing more work than the task. Do the small version of it.',
    },
    {
      quote: 'You have power over your mind, not outside events. Realise this, and you will find strength.',
      source: 'Marcus Aurelius',
      so: 'Nothing outside you needs deciding today. One thing leaves the machine.',
    },
    {
      quote: 'Man is not worried by real problems so much as by his imagined anxieties about real problems.',
      source: 'Epictetus',
      so: 'Name the actual next move. The rest is weather.',
    },
  ],
  depleted_calm: [
    {
      quote: 'Well-being is realised by small steps, but is truly no small thing.',
      source: 'Zeno of Citium',
      so: 'Small is the correct size today. Take it and stop.',
    },
    {
      quote: 'It is not that we have a short time to live, but that we waste a lot of it.',
      source: 'Seneca',
      so: 'Fifteen minutes spent outward beats a full day spent tidying.',
    },
    {
      quote: 'Confine yourself to the present.',
      source: 'Marcus Aurelius',
      so: 'Today only. Tomorrow was already decided last night.',
    },
  ],
  steady: [
    {
      quote: 'If it is not right, do not do it. If it is not true, do not say it.',
      source: 'Marcus Aurelius',
      so: 'A steady day is for finishing, not for starting something new.',
    },
    {
      quote: 'First say to yourself what you would be, then do what you have to do.',
      source: 'Epictetus',
      so: 'You know the move. Make it before the day fills up.',
    },
    {
      quote: 'Every new beginning comes from some other beginning’s end.',
      source: 'Seneca',
      so: 'Close one open loop before you open another.',
    },
  ],
  strong_anxious: [
    {
      quote: 'He who is brave is free.',
      source: 'Seneca',
      so: 'The energy is real. Point it at the thing you are avoiding, not the thing you enjoy.',
    },
    {
      quote: 'It is the power of the mind to be unconquerable.',
      source: 'Seneca',
      so: 'High charge plus high noise wants to reorganise something. Ship instead.',
    },
    {
      quote: 'Waste no more time arguing about what a good man should be. Be one.',
      source: 'Marcus Aurelius',
      so: 'Do not plan the week. Send the thing.',
    },
  ],
  strong_calm: [
    {
      quote: 'The impediment to action advances action. What stands in the way becomes the way.',
      source: 'Marcus Aurelius',
      so: 'This is your best state. Spend it on the hardest external thing, not the easiest.',
    },
    {
      quote: 'Luck is what happens when preparation meets opportunity.',
      source: 'Seneca',
      so: 'Days like this are rare. Do the ask you have been postponing.',
    },
    {
      quote: 'No man is free who is not master of himself.',
      source: 'Epictetus',
      so: 'Nothing is in the way. That is the whole point, so use it outward.',
    },
  ],
}

/**
 * The line for today. Rotates by date so the same state on consecutive days
 * does not repeat, and is deterministic so a reload never reshuffles it.
 */
export function stoicFor(energy: number, anxiety: number, isoDate: string): StoicLine {
  const bucket = bucketFor(energy, anxiety)
  const set = LIBRARY[bucket]
  const seed = isoDate.split('-').reduce((a, p) => a + Number(p), 0)
  return set[seed % set.length]
}

/** A one-line reading of the state itself, shown above the quote. */
export function readingFor(energy: number, anxiety: number): string {
  switch (bucketFor(energy, anxiety)) {
    case 'depleted_anxious': return 'Low and loud.'
    case 'depleted_calm':    return 'Low but quiet.'
    case 'strong_anxious':   return 'Charged and noisy.'
    case 'strong_calm':      return 'Clear and sharp.'
    default:                 return 'Level.'
  }
}
