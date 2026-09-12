import type { HarnessEvent } from './_event.js'

export type EventReceipt = {
  inbox_id: number
  event_id: string
  received_at?: string
  payload_sha256: string
}

export type EventStoreReply = {
  data: EventReceipt | null
  errorCode: string | null
}

export type HarnessEventStore = {
  insert(event: HarnessEvent): Promise<EventStoreReply>
  findByEventId(eventId: string): Promise<EventStoreReply>
}

type StoreResult = {
  status: number
  body: Record<string, unknown>
  logCode?: string
}

export async function persistHarnessEvent(store: HarnessEventStore, event: HarnessEvent): Promise<StoreResult> {
  const { data, errorCode } = await store.insert(event)

  if (!errorCode && data) {
    return { status: 201, body: { ok: true, duplicate: false, receipt: data } }
  }
  if (!errorCode) {
    return { status: 500, body: { ok: false, error: 'receipt_readback_failed' } }
  }
  if (errorCode !== '23505') {
    return { status: 500, body: { ok: false, error: 'write_failed' }, logCode: errorCode }
  }

  const { data: existing, errorCode: readErrorCode } = await store.findByEventId(event.event_id)
  if (readErrorCode || !existing) {
    return { status: 500, body: { ok: false, error: 'receipt_readback_failed' }, logCode: readErrorCode || undefined }
  }
  if (existing.payload_sha256 !== event.payload_sha256) {
    return { status: 409, body: { ok: false, error: 'event_id_conflict' } }
  }
  return { status: 200, body: { ok: true, duplicate: true, receipt: existing } }
}
