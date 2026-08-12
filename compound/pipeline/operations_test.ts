import { failureAlertIdempotencyKey } from "./alert.ts";
import { batchDates, nextDate } from "./backfill.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("backfill batches are bounded and resumable", () => {
  const first = batchDates("2021-01-01", "2021-02-15");
  assert(first.length === 30, "a batch must stop after 30 dates");
  assert(first[0] === "2021-01-01", "the range start must be included");
  const resumed = batchDates(nextDate(first.at(-1)!), "2021-02-15");
  assert(resumed[0] === "2021-01-31", "the next batch must resume without a gap or duplicate");
  assert(resumed.at(-1) === "2021-02-15", "the final batch must include the range end");
});

Deno.test("one scheduled member and date always produces one alert key", () => {
  const first = failureAlertIdempotencyKey("member-1", "2026-08-11");
  const retry = failureAlertIdempotencyKey("member-1", "2026-08-11");
  const nextDay = failureAlertIdempotencyKey("member-1", "2026-08-12");
  assert(first === retry, "retries must reuse the alert idempotency key");
  assert(first !== nextDay, "the next scheduled date needs a new key");
});
