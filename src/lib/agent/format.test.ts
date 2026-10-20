import { describe, expect, it } from "vitest";
import { formatLocal, isoInZone, parseLocal } from "@/lib/agent/format";

describe("isoInZone", () => {
  it("renders the local wall-clock time with the zone offset", () => {
    const d = new Date("2026-10-20T17:05:09Z");
    expect(isoInZone(d, "Europe/Berlin")).toBe("2026-10-20T19:05:09+02:00"); // CEST
    expect(isoInZone(d, "Asia/Kolkata")).toBe("2026-10-20T22:35:09+05:30");
    expect(isoInZone(d, "America/New_York")).toBe("2026-10-20T13:05:09-04:00");
    expect(isoInZone(d, "UTC")).toBe("2026-10-20T17:05:09+00:00");
  });

  it("follows DST changes", () => {
    expect(isoInZone(new Date("2026-12-01T12:00:00Z"), "Europe/Berlin")).toBe("2026-12-01T13:00:00+01:00");
  });

  it("round-trips through Date", () => {
    const d = new Date("2026-03-29T00:30:00Z");
    expect(new Date(isoInZone(d, "Europe/Berlin")).getTime()).toBe(d.getTime());
  });
});

describe("parseLocal", () => {
  it("uses the offset in effect on the target day, across DST", () => {
    // Berlin leaves summer time on 25 Oct 2026.
    expect(parseLocal("2026-10-24T09:00", "Europe/Berlin").toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(parseLocal("2026-10-26T09:00", "Europe/Berlin").toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("accepts bare dates, seconds, and explicit offsets", () => {
    expect(parseLocal("2026-10-23", "Asia/Kolkata").toISOString()).toBe("2026-10-22T18:30:00.000Z");
    expect(parseLocal("2026-10-23T23:59:30", "UTC").toISOString()).toBe("2026-10-23T23:59:30.000Z");
    expect(parseLocal("2026-10-23T10:00:00-04:00", "Europe/Berlin").toISOString()).toBe("2026-10-23T14:00:00.000Z");
  });

  it("rejects garbage", () => {
    expect(() => parseLocal("next friday", "UTC")).toThrow(RangeError);
  });
});

describe("formatLocal", () => {
  it("includes weekday and local time", () => {
    expect(formatLocal(new Date("2026-10-20T17:05:00Z"), "Europe/Berlin")).toBe("Tue, 20 Oct 2026, 19:05");
  });
});
