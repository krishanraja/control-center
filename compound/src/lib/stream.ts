import type { Session } from "@supabase/supabase-js";
import type { ChatEvent, Horizon } from "../types";
import type { CompoundConfig } from "./env";

export interface AskRequest {
  question: string;
  horizon: Horizon;
  snapshotId: string;
  threadId?: string;
  requestId: string;
}

function parseBlock(block: string): ChatEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine.startsWith("event:")) eventName = rawLine.slice(6).trim();
    if (rawLine.startsWith("data:")) dataLines.push(rawLine.slice(5).trimStart());
  }

  if (!dataLines.length) return null;
  const parsed: unknown = JSON.parse(dataLines.join("\n"));
  if (!parsed || typeof parsed !== "object") return null;
  const data = parsed as Record<string, unknown>;

  if (eventName === "meta" && typeof data.threadId === "string" && typeof data.snapshotAsOf === "string") {
    return { event: "meta", data: { threadId: data.threadId, snapshotAsOf: data.snapshotAsOf } };
  }
  if (eventName === "delta" && typeof data.text === "string") return { event: "delta", data: { text: data.text } };
  if (eventName === "done" && typeof data.messageId === "string") return { event: "done", data: { messageId: data.messageId } };
  if (eventName === "error" && typeof data.message === "string" && typeof data.retryable === "boolean") {
    return { event: "error", data: { message: data.message, retryable: data.retryable } };
  }
  if (eventName === "evidence" && Array.isArray(data.items) && Array.isArray(data.excluded)) {
    const items = data.items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      return typeof row.id === "string" && typeof row.label === "string" && typeof row.source === "string" && typeof row.checkedAt === "string"
        ? [{ id: row.id, label: row.label, source: row.source, checkedAt: row.checkedAt }]
        : [];
    });
    const excluded = data.excluded.filter((item): item is string => typeof item === "string");
    return { event: "evidence", data: { items, excluded } };
  }
  return null;
}

export async function readSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseBlock(block.trim());
      if (event) onEvent(event);
    }
    if (done) break;
  }

  const finalEvent = parseBlock(buffer.trim());
  if (finalEvent) onEvent(finalEvent);
}

export async function streamCompoundAnswer(
  config: CompoundConfig,
  session: Session,
  request: AskRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error(config.error ?? "COMPOUND is not connected.");

  const response = await fetch("/api/compound-ask", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    let message = "COMPOUND could not answer right now.";
    try {
      const body = await response.json() as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // The safe fallback is intentionally generic.
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error("The answer arrived without a readable response.");
  await readSse(response.body, onEvent);
}
