import { easternClock, isDailyPublicationWindow, isScheduledCronForEasternTime } from "./schedule.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("summer cron selects 10:30 UTC", () => {
  const at = new Date("2026-08-11T10:30:00Z");
  assert(easternClock(at).hour === 6, "summer Eastern hour should be 06");
  assert(isDailyPublicationWindow(at), "summer cron should run");
  assert(!isDailyPublicationWindow(new Date("2026-08-11T11:30:00Z")), "duplicate UTC cron must skip");
});

Deno.test("winter cron selects 11:30 UTC", () => {
  assert(!isDailyPublicationWindow(new Date("2026-12-11T10:30:00Z")), "early UTC cron must skip");
  assert(isDailyPublicationWindow(new Date("2026-12-11T11:30:00Z")), "winter cron should run");
});

Deno.test("publication includes weekends", () => {
  assert(isDailyPublicationWindow(new Date("2026-08-09T10:30:00Z")), "Sunday should publish");
});

Deno.test("a delayed GitHub job still honors the intended cron", () => {
  const delayedSummerStart = new Date("2026-08-11T11:15:00Z");
  assert(
    isScheduledCronForEasternTime("30 10 * * *", delayedSummerStart),
    "summer cron should survive queue delay",
  );
  assert(
    !isScheduledCronForEasternTime("30 11 * * *", delayedSummerStart),
    "duplicate summer cron must skip",
  );
  const delayedWinterStart = new Date("2026-12-11T12:05:00Z");
  assert(
    isScheduledCronForEasternTime("30 11 * * *", delayedWinterStart),
    "winter cron should survive queue delay",
  );
});
