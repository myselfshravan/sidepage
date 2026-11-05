import type { PartialDate } from "../types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Returns an error message, or null when the date is coherent. */
export function checkPartialDate(date: PartialDate): string | null {
  if (!Number.isInteger(date.year) || date.year < 1000 || date.year > 9999) {
    return "Year must be a four-digit number.";
  }
  if (date.day !== undefined && date.month === undefined) {
    return "A day needs a month.";
  }
  if (date.month !== undefined && (!Number.isInteger(date.month) || date.month < 1 || date.month > 12)) {
    return "Month must be between 1 and 12.";
  }
  if (date.day !== undefined) {
    const max = daysInMonth(date.year, date.month!);
    if (!Number.isInteger(date.day) || date.day < 1 || date.day > max) {
      return `Day must be between 1 and ${max}.`;
    }
  }
  return null;
}

/** "c. March 1984", "12 March 1984", "1984". */
export function formatPartialDate(date: PartialDate): string {
  const parts: string[] = [];
  if (date.day !== undefined) parts.push(String(date.day));
  if (date.month !== undefined) parts.push(MONTHS[date.month - 1]!);
  parts.push(String(date.year));
  return `${date.approximate ? "c. " : ""}${parts.join(" ")}`;
}

/** Sort key: earliest instant the partial date could refer to. */
export function partialDateSortKey(date: PartialDate): number {
  return Date.UTC(date.year, (date.month ?? 1) - 1, date.day ?? 1);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a wall-clock time the author typed ("2026-11-05T09:30" in Asia/Kolkata)
 * into the instant it denotes. Uses the offset in effect at that wall time.
 */
export function zonedWallTimeToInstant(wall: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);
  if (!match) throw new Error("Expected YYYY-MM-DDTHH:mm");
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes handle DST boundaries: guess the offset, then correct with the offset at the guess.
  let instant = asUtc - offsetMs(new Date(asUtc), timeZone);
  instant = asUtc - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Formats an instant as the wall-clock "YYYY-MM-DDTHH:mm" in a zone (inverse of the above). */
export function instantToZonedWallTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

function zonedParts(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const get = (type: string) => Number(fmt.formatToParts(instant).find((p) => p.type === type)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}
