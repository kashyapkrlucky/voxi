import { describe, expect, it } from "vitest";
import { isValidRecurrenceRule, nextOccurrence } from "@/lib/recurrence";

describe("recurrence", () => {
  it("validates rules with or without RRULE: prefix", () => {
    expect(isValidRecurrenceRule("FREQ=WEEKLY;BYDAY=MO")).toBe(true);
    expect(isValidRecurrenceRule("RRULE:FREQ=DAILY")).toBe(true);
    expect(isValidRecurrenceRule("every monday")).toBe(false);
  });

  it("returns the next occurrence after the anchor", () => {
    const from = new Date("2026-10-19T09:00:00Z"); // Monday
    expect(nextOccurrence("FREQ=DAILY", from)?.toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(nextOccurrence("FREQ=WEEKLY", from)?.toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("returns null once a rule has ended", () => {
    expect(nextOccurrence("FREQ=DAILY;COUNT=1", new Date("2026-10-19T09:00:00Z"))).toBeNull();
  });
});

describe("recurrence across DST", () => {
  it("keeps the local wall-clock time when the offset changes", () => {
    // Berlin leaves summer time on 25 Oct 2026: 08:00 local is 06:00Z before, 07:00Z after.
    const sat = new Date("2026-10-24T06:00:00Z");
    expect(nextOccurrence("FREQ=DAILY", sat, "Europe/Berlin")?.toISOString()).toBe("2026-10-25T07:00:00.000Z");
    expect(nextOccurrence("FREQ=WEEKLY", sat, "Europe/Berlin")?.toISOString()).toBe("2026-10-31T07:00:00.000Z");
  });

  it("evaluates BYDAY on the local date, not the UTC date", () => {
    // Mon 00:30 in Kolkata is still Sunday in UTC.
    const mon = new Date("2026-10-18T19:00:00Z"); // Mon 19 Oct 00:30 IST
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO", mon, "Asia/Kolkata")?.toISOString()).toBe("2026-10-25T19:00:00.000Z");
  });
});
