/**
 * A populated work board (src/lib/workBoard.ts): two items waiting on Krish,
 * one in progress, one done, and an earlier reply a session has read. Shared
 * by board-phone and board-desk so the two sizes measure the same morning.
 */
export const BOARD = {
  ok: true,
  state: {
    headline: 'Two things need you: yes to article 1\'s video, and article 3.',
    signals: [{ label: 'Home computer', state: 'ok', text: 'On, up to date, ready' }, { label: 'AI spend, last 14 days', state: '', text: '$85.60' }],
    updated_by: 'codex',
    updated_at: '2026-10-03T19:30:00.000Z',
  },
  items: [
    { id: 'you-p1-brief', lane: 'on_you', rank: 1, area: 'Article 1 · video', title: 'Say yes to turning article 1 into a video and slides', detail: 'Before that starts, you confirm five things.', link: 'https://controlcenter.krishraja.com/#/content?idea=6cb0d213-1aa6-44d3-8dc2-0b91d8dde4df', link_label: 'Open article 1', prompt: "'yes, make the video' or what to change", updated_by: 'claude_code', updated_at: '2026-10-03T19:30:00.000Z' },
    { id: 'you-p3-approve', lane: 'on_you', rank: 2, area: 'Article 3', title: 'Read article 3 and say yes or what to change', detail: 'Every fact in it has been checked.', link: null, link_label: null, prompt: 'Yes, or what to change', updated_by: 'claude_code', updated_at: '2026-10-03T19:00:00.000Z' },
    { id: 'doing-next-picks', lane: 'in_progress', rank: 2, area: 'Articles', title: 'Your next two articles', detail: 'They start once article 3 is approved.', link: null, link_label: null, prompt: null, updated_by: 'codex', updated_at: '2026-10-03T18:00:00.000Z' },
    { id: 'doing-composer-phone', lane: 'done', rank: 0, area: 'Control Center', title: 'Buttons no longer fall off the phone screen', detail: 'Now they all fit.', link: null, link_label: null, prompt: null, updated_by: 'claude_code', updated_at: '2026-10-02T12:45:00.000Z' },
  ],
  replies: [
    { id: '11111111-1111-4111-8111-111111111111', item_id: 'you-p3-approve', text: 'Reading it tonight', by: 'Krish', at: '2026-10-03T19:10:00.000Z', seen_at: '2026-10-03T19:20:00.000Z', seen_by: 'codex' },
  ],
  unseen_replies: 0,
}
