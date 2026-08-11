export interface EasternClock {
  date: string;
  hour: number;
  minute: number;
}

export function easternClock(at: Date): EasternClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function isDailyPublicationWindow(at: Date): boolean {
  const clock = easternClock(at);
  return clock.hour === 6 && clock.minute >= 30 && clock.minute < 40;
}

export function isScheduledCronForEasternTime(cron: string, executedAt: Date): boolean {
  const utcHour = cron === "30 10 * * *" ? 10 : cron === "30 11 * * *" ? 11 : undefined;
  if (utcHour === undefined) return false;
  const date = easternClock(executedAt).date;
  const scheduled = new Date(`${date}T${String(utcHour).padStart(2, "0")}:30:00Z`);
  const eastern = easternClock(scheduled);
  return eastern.date === date && eastern.hour === 6 && eastern.minute === 30;
}
