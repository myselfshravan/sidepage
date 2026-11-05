import { describe, expect, it } from "vitest";
import {
  checkPartialDate,
  formatPartialDate,
  instantToZonedWallTime,
  isValidTimeZone,
  zonedWallTimeToInstant,
} from "@/domain/dates/partial-date";
import { checkSlug, slugify, uniqueSlug } from "@/domain/publication/slug";

describe("partial dates", () => {
  it("formats by precision", () => {
    expect(formatPartialDate({ year: 1984, approximate: false })).toBe("1984");
    expect(formatPartialDate({ year: 1984, month: 3, approximate: true })).toBe("c. March 1984");
    expect(formatPartialDate({ year: 1984, month: 3, day: 12, approximate: false })).toBe("12 March 1984");
  });

  it("rejects incoherent dates", () => {
    expect(checkPartialDate({ year: 1984, day: 3, approximate: false })).toMatch(/needs a month/);
    expect(checkPartialDate({ year: 2023, month: 2, day: 29, approximate: false })).toMatch(/between 1 and 28/);
    expect(checkPartialDate({ year: 2024, month: 2, day: 29, approximate: false })).toBeNull();
    expect(checkPartialDate({ year: 84, approximate: false })).toMatch(/four-digit/);
  });
});

describe("time zones", () => {
  it("converts an author's wall time to an instant and back", () => {
    const instant = zonedWallTimeToInstant("2026-11-05T09:30", "Asia/Kolkata");
    expect(instant.toISOString()).toBe("2026-11-05T04:00:00.000Z");
    expect(instantToZonedWallTime(instant, "Asia/Kolkata")).toBe("2026-11-05T09:30");
  });

  it("handles daylight saving offsets", () => {
    expect(zonedWallTimeToInstant("2026-07-01T12:00", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedWallTimeToInstant("2026-01-01T12:00", "America/New_York").toISOString()).toBe("2026-01-01T17:00:00.000Z");
  });

  it("validates IANA names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("slugs", () => {
  it("slugifies titles", () => {
    expect(slugify("The Things We Never Said")).toBe("the-things-we-never-said");
    expect(slugify("Café — Noir’s Return!")).toBe("cafe-noirs-return");
  });

  it("validates and de-duplicates", () => {
    expect(checkSlug("studio")).toMatch(/reserved/);
    expect(checkSlug("Bad Slug")).toMatch(/lowercase/);
    expect(checkSlug("good-slug")).toBeNull();
    expect(uniqueSlug("chapter", new Set(["chapter", "chapter-2"]))).toBe("chapter-3");
  });
});
