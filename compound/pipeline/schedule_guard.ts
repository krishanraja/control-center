import { easternClock, isScheduledCronForEasternTime } from "./schedule.ts";

const now = new Date();
const cronIndex = Deno.args.indexOf("--cron");
const cron = cronIndex >= 0 ? Deno.args[cronIndex + 1] ?? "" : "";
const shouldRun = isScheduledCronForEasternTime(cron, now);
const output = Deno.env.get("GITHUB_OUTPUT");
if (output) {
  await Deno.writeTextFile(output, `should_run=${shouldRun}\nsnapshot_date=${easternClock(now).date}\n`, {
    append: true,
  });
}
console.log(shouldRun ? "06:30 Eastern publication window" : "duplicate UTC cron skipped");
