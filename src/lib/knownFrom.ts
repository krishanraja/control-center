// Where Krish knows someone from, in the words he would use.
//
// contacts.origin_channel names the pipeline that loaded a person, and for
// 8,295 of them it is 'network_intelligence', which the chip printed as
// "LinkedIn network". That was wrong for 1,830 people from his phone, 460 from
// Instagram and 1,839 from his mailbox. The truth was always in
// contacts.sources and, since 2026-10-04, in contact_identities: every network
// a person was actually found in. This reads both.
//
// One vocabulary, used by the API (search rows, the review queue, the ask
// flow) and by the chips, so the same person is never described two ways.

export type KnownFromKey =
  | 'facebook' | 'instagram' | 'linkedin' | 'email' | 'linkedin_messages' | 'phone' | 'community' | 'list'

const ORDER: KnownFromKey[] = ['facebook', 'instagram', 'linkedin', 'email', 'linkedin_messages', 'phone', 'community', 'list']

export const KNOWN_FROM_LABEL: Record<KnownFromKey, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  email: 'email',
  linkedin_messages: 'LinkedIn messages',
  phone: 'your phone',
  community: 'a community',
  list: 'one of your lists',
}

/** The networks of his own life rather than his work. */
export const PERSONAL: ReadonlySet<KnownFromKey> = new Set<KnownFromKey>(['facebook', 'instagram'])

const SOURCE_KEY: Record<string, KnownFromKey> = {
  linkedin_export: 'linkedin',
  instagram_export: 'instagram',
  phone_address_book: 'phone',
  gmail_krish_mindmaker: 'email',
  linkedin_messages: 'linkedin_messages',
  linkedin_messages_profile: 'linkedin_messages',
  circle_roster: 'community',
  sheet: 'list',
  control_center_contacts: 'list',
  instantly: 'list',
}

const IDENTITY_KEY: Record<string, KnownFromKey> = {
  facebook: 'facebook',
  instagram: 'instagram',
  phone_book: 'phone',
}

/** Every network a person was found in, most personal first. */
export function knownFrom(sources: unknown, identityKinds: readonly string[] = []): KnownFromKey[] {
  const got = new Set<KnownFromKey>()
  if (Array.isArray(sources)) {
    for (const s of sources as Array<Record<string, unknown>>) {
      if (!s || typeof s !== 'object') continue
      if (s.type === 'meta_export' && Array.isArray(s.networks)) {
        for (const n of s.networks as string[]) if (IDENTITY_KEY[n]) got.add(IDENTITY_KEY[n])
        continue
      }
      const k = SOURCE_KEY[String(s.source || s.type || '')]
      if (k) got.add(k)
    }
  }
  for (const kind of identityKinds) if (IDENTITY_KEY[kind]) got.add(IDENTITY_KEY[kind])
  return ORDER.filter(k => got.has(k))
}

/** "Facebook and Instagram", "Facebook, Instagram and LinkedIn". */
export function knownFromWords(keys: readonly string[] | null | undefined): string | null {
  const words = (keys || []).filter((k): k is KnownFromKey => k in KNOWN_FROM_LABEL).map(k => KNOWN_FROM_LABEL[k])
  if (!words.length) return null
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

export function isPersonal(keys: readonly string[] | null | undefined): boolean {
  return (keys || []).some(k => PERSONAL.has(k as KnownFromKey))
}
