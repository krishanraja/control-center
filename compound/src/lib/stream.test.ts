import { describe, expect, it, vi } from "vitest";
import { readSse } from "./stream";

function streamChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe("readSse", () => {
  it("parses events split across network chunks", async () => {
    const onEvent = vi.fn();
    await readSse(streamChunks([
      "event: meta\r\ndata: {\"threadId\":\"t1\",",
      "\"snapshotAsOf\":\"now\"}\r\n\r\nevent: delta\ndata: {\"text\":\"Hello\"}\n\n",
      "event: done\ndata: {\"messageId\":\"m1\"}\n\n",
    ]), onEvent);

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls[1][0]).toEqual({ event: "delta", data: { text: "Hello" } });
  });

  it("ignores comments and unknown event types", async () => {
    const onEvent = vi.fn();
    await readSse(streamChunks([
      ": keepalive\n\nevent: mystery\ndata: {}\n\nevent: evidence\ndata: {\"items\":[],\"excluded\":[]}\n\n",
    ]), onEvent);

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent.mock.calls[0][0].event).toBe("evidence");
  });

  it("drops malformed known events instead of trusting provider data", async () => {
    const onEvent = vi.fn();
    await readSse(streamChunks([
      "event: delta\ndata: {\"text\":42}\n\nevent: error\ndata: {\"message\":\"no\"}\n\n",
    ]), onEvent);

    expect(onEvent).not.toHaveBeenCalled();
  });
});
