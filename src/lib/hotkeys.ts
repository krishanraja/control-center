// Global hotkeys must never fire while the user is typing.
//
// This bit the brief editor hard: ⌘I is the universal italic binding, but the
// capture pill's handler only skipped INPUT, so pressing ⌘I inside TipTap's
// contenteditable opened the Capture Idea modal instead of italicising — and
// because that handler toggles, a second ⌘I closed it and threw the text away.
// ⌘J and ⌘K had no guard at all.
//
// SwipeDeck and TriageDeck already had the correct test inline; this is that
// same test, in one place, so the next global shortcut inherits it.

/** True when the event target is a field the user is typing into. */
export function isTypingTarget(e: Pick<KeyboardEvent, 'target'>): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return (
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable === true
  )
}
