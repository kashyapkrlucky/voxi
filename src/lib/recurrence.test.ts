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
