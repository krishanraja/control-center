import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightContext } from "./context";
import { useInsightContext, type ContextTopic } from "./useInsightContext";

const topics: ContextTopic[] = [
  { id: "one", topic: "Solana" },
  { id: "two", topic: "Palantir" },
];

const context: InsightContext = {
  summary: "Fees fell while deposits held.",
  citations: [{ title: "Reuters", url: "https://reuters.com/solana" }],
  asOf: "2026-08-08",
  via: "perplexity",
};

beforeEach(() => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInsightContext", () => {
  it("fetches each topic once without an id query and reuses the daily cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => context });
    vi.stubGlobal("fetch", fetchMock);

    const first = renderHook(() => useInsightContext({ mode: "live" }, topics));
    await waitFor(() => expect(Object.keys(first.result.current)).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url] of fetchMock.mock.calls) {
      expect(url).toMatch(/^\/api\/context\?q=/);
      expect(url).not.toContain("id=");
    }
    first.unmount();

    const second = renderHook(() => useInsightContext({ mode: "live" }, topics));
    await waitFor(() => expect(Object.keys(second.result.current)).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  it("caches a successful empty response so remounts do not repeat it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const oneTopic = topics.slice(0, 1);

    const first = renderHook(() => useInsightContext({ mode: "live" }, oneTopic));
    await waitFor(() => expect(window.sessionStorage.length).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useInsightContext({ mode: "live" }, oneTopic));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(second.result.current).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it("uses the deterministic cited demo fixtures", () => {
    const { result } = renderHook(() => useInsightContext({ mode: "demo" }, [
      { id: "n1", topic: "AI chips" },
    ]));
    expect(result.current.n1?.citations.length).toBeGreaterThan(0);
  });
});
