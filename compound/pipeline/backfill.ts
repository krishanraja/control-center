import { runDate } from "./main.ts";
import { listMembers, readBackfillCheckpoint, upsertBackfillCheckpoint } from "./supabase.ts";

export function nextDate(date: string, days = 1): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function batchDates(start: string, end: string, limit = 30): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end && dates.length < limit) {
    dates.push(cursor);
    cursor = nextDate(cursor);
  }
  return dates;
}

function readArg(name: string): string | undefined {
  const index = Deno.args.indexOf(`--${name}`);
  return index >= 0 ? Deno.args[index + 1] : undefined;
}

if (import.meta.main) {
  const rangeStart = readArg("range-start");
  const rangeEnd = readArg("range-end");
  if (!rangeStart || !rangeEnd) throw new Error("--range-start and --range-end are required");
  if (rangeStart > rangeEnd) throw new Error("range-start must not be after range-end");
  const members = await listMembers();
  if (members.length === 0) throw new Error("No approved COMPOUND members are configured");
  const checkpoints = await Promise.all(members.map(async (member) => ({
    member,
    checkpoint: await readBackfillCheckpoint({ userId: member.user_id, rangeStart, rangeEnd }),
  })));
  let cursor = checkpoints.map((item) => item.checkpoint?.next_date ?? rangeStart).sort()[0];
  let processed = 0;

  try {
    for (const date of batchDates(cursor, rangeEnd)) {
      cursor = date;
      await Promise.all(members.map((member) =>
        upsertBackfillCheckpoint({
          userId: member.user_id,
          rangeStart,
          rangeEnd,
          nextDate: cursor,
          status: "running",
          metadata: { batchStartedAt: new Date().toISOString(), batchSize: 30 },
        })
      ));
      await runDate({ date: cursor, mode: "backfill", attempt: 1 });
      cursor = nextDate(cursor);
      processed += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await Promise.all(members.map((member) =>
        upsertBackfillCheckpoint({
          userId: member.user_id,
          rangeStart,
          rangeEnd,
          nextDate: cursor,
          status: cursor > rangeEnd ? "complete" : "pending",
          metadata: { processedInBatch: processed, lastCompletedDate: nextDate(cursor, -1) },
        })
      ));
    }
    console.log(`Backfill batch completed ${processed} day(s); next date ${cursor}`);
  } catch (error) {
    await Promise.all(members.map((member) =>
      upsertBackfillCheckpoint({
        userId: member.user_id,
        rangeStart,
        rangeEnd,
        nextDate: cursor,
        status: "failed",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      })
    ));
    throw error;
  }
}
