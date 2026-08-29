import type { TimePoint } from "./types.ts";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function fetchJson<T>(url: URL, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "COMPOUND/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${url.hostname} returned ${response.status}`);
  }
  return await response.json() as T;
}

export function daysBefore(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function parseNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sortedPoints(points: TimePoint[]): TimePoint[] {
  return points
    .filter((point) => Number.isFinite(point.value) && /^\d{4}-\d{2}-\d{2}$/.test(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}
