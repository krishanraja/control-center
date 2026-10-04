import type { Page, Route } from '@playwright/test'
import { assertRendered } from './layout'
import { answerPilotGate } from '../pilot-gate-mock'

// Fixtures for People to check, shared by the desk and phone specs. Every
// person here is invented.

const PERSON = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, title: null, company: null, location: null, email_domain: null, linkedin_slug: null,
  known_from: [], evidence: null, warmth: null, warmth_measured: false, plays: [], ...over,
})

export const MERGES = [
  {
    id: 'b0000000-0000-4000-8000-000000000001', surface: 'contact_merge', deferred: false, rule: 'same_name',
    reason: 'The same name is already in your network, and nothing else says whether it is the same person.',
    a: PERSON('c0000000-0000-4000-8000-00000000000a', 'Orla Fenwick-Price', { title: 'Chief Revenue Officer', company: 'Glasshouse Media', known_from: ['linkedin', 'email'], email_domain: 'glasshouse.example.org', evidence: '42 messages both ways' }),
    b: PERSON('c0000000-0000-4000-8000-00000000000b', 'Orla Fenwick-Price', { known_from: ['facebook', 'instagram'] }),
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002', surface: 'contact_merge', deferred: false, rule: 'same_name',
    reason: 'The same name is already in your network, and nothing else says whether it is the same person.',
    a: PERSON('c0000000-0000-4000-8000-00000000000c', 'Declan Ashworth', { company: 'Ashworth & Co', known_from: ['list'] }),
    b: PERSON('c0000000-0000-4000-8000-00000000000d', 'Declan Ashworth', { known_from: ['phone'] }),
  },
]

export const LINKS = [
  {
    id: 'b0000000-0000-4000-8000-000000000003', surface: 'contact_link', deferred: false, memorial: false, networks: ['facebook'],
    reason: 'Apify found several LinkedIn profiles with this name and could not tell which, if any, is them.',
    person: PERSON('c0000000-0000-4000-8000-00000000000e', 'Saffron Mbeki-Hart', { known_from: ['facebook'] }),
    candidates: [
      { url: 'https://www.linkedin.com/in/saffron-mbeki-hart-1/', slug: 'saffron-mbeki-hart-1', title: 'Saffron Mbeki-Hart - Product Lead - Leeds', profile: null },
      { url: 'https://www.linkedin.com/in/saffron-mbeki-hart-2/', slug: 'saffron-mbeki-hart-2', title: 'Saffron Mbeki-Hart - Teacher - Perth', profile: null },
    ],
  },
  {
    id: 'b0000000-0000-4000-8000-000000000004', surface: 'contact_link', deferred: false, memorial: true, networks: ['phone_book'],
    reason: 'The LinkedIn profile matched to this person is a memorial page. They are kept out of every proposal until you say.',
    person: PERSON('c0000000-0000-4000-8000-00000000000f', 'Rowan Ilsley', { known_from: ['phone'] }),
    candidates: [{ url: 'https://www.linkedin.com/in/rowan-ilsley-rip/', slug: 'rowan-ilsley-rip', title: 'Rowan Ilsley', profile: null }],
  },
]

export async function openNetwork(page: Page, posts: Array<Record<string, unknown>>, counts = { contact_merge: 2, contact_link: 2 }) {
  // Catch-alls FIRST: Playwright matches routes in reverse registration order.
  await page.route('**/realtime/**', r => r.abort())
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/api/network/geo', r => r.fulfill({ json: { ok: true, total: 12_400, known: 4_212, unknown: 8_188, countries: [] } }))
  await page.route('**/api/network/by-play', (r: Route) =>
    r.fulfill({ json: { ok: true, counts: { alumni: 826, personal: 1180 }, people: 12_400, employers: [], schools: [] } }))
  await page.route('**/api/network/review**', (r: Route) => {
    if (r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON() as Record<string, unknown>)
      return r.fulfill({ json: { ok: true, applied: {} } })
    }
    const surface = new URL(r.request().url()).searchParams.get('surface')
    return r.fulfill({ json: { ok: true, surface, counts, items: surface === 'contact_link' ? LINKS : MERGES } })
  })
  await answerPilotGate(page)
  await page.goto('/#/people?lane=network')
  await assertRendered(page, 'main')
}

