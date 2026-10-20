import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { chatMessages, getCurrentChat, MAX_STORED_MESSAGES, saveChatMessages, startNewChat } from "@/lib/chat";
import { prisma } from "@/lib/db";
import { fireReminder } from "@/lib/reminders/fire";
import { createReminder, setBriefing } from "@/lib/reminders/repo";
import { getSettings, quietUntil, updateSettings } from "@/lib/settings";
import { createTestUser } from "@/lib/test-utils";

let userId: string;
let cleanup: () => Promise<unknown>;

beforeAll(async () => {
  ({ userId, cleanup } = await createTestUser());
  await prisma.user.update({ where: { id: userId }, data: { timezone: "Europe/Berlin" } });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("settings", () => {
  it("reads defaults and updates with HH:MM times", async () => {
    expect(await getSettings(userId)).toEqual({
      timezone: "Europe/Berlin",
      workStart: "09:00",
      workEnd: "18:00",
      quietStart: null,
      quietEnd: null,
    });
    expect(
      await updateSettings(userId, { workStart: "08:30", workEnd: "17:00", quietStart: "22:00", quietEnd: "07:00" }),
    ).toMatchObject({
      workStart: "08:30",
      workEnd: "17:00",
      quietStart: "22:00",
      quietEnd: "07:00",
    });
    expect(await updateSettings(userId, { quietStart: null })).toMatchObject({ quietStart: null, quietEnd: null });
  });

  it("rejects bad input", async () => {
    await expect(updateSettings(userId, { timezone: "Mars/Olympus" })).rejects.toThrow();
    await expect(updateSettings(userId, { workStart: "9am" })).rejects.toThrow();
    await expect(updateSettings(userId, { workStart: "18:00", workEnd: "09:00" })).rejects.toBeInstanceOf(RangeError);
    await expect(updateSettings(userId, { quietStart: "22:00" })).rejects.toBeInstanceOf(RangeError); // end missing
  });

  it("keeps briefings at the same local time after a timezone change", async () => {
    const now = new Date("2026-10-20T04:00:00Z"); // 06:00 Berlin
    await setBriefing(userId, "morning_briefing", "07:30", now);
    await updateSettings(userId, { timezone: "America/New_York" });
    const b = await prisma.reminder.findFirstOrThrow({
      where: { userId, kind: "morning_briefing", status: "scheduled" },
    });
    expect(
      b.fireAt.toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }),
    ).toBe("07:30");
    await updateSettings(userId, { timezone: "Europe/Berlin" });
  });

  it("quietUntil handles windows that wrap midnight", () => {
    const night = { quietStartMin: 22 * 60, quietEndMin: 7 * 60 };
    expect(quietUntil(night, 23 * 60)).toBe(7 * 60);
    expect(quietUntil(night, 3 * 60)).toBe(7 * 60);
    expect(quietUntil(night, 7 * 60)).toBeNull();
    expect(quietUntil({ quietStartMin: 13 * 60, quietEndMin: 14 * 60 }, 13 * 60 + 30)).toBe(14 * 60);
    expect(quietUntil({ quietStartMin: null, quietEndMin: null }, 0)).toBeNull();
  });
});

describe("quiet hours delivery", () => {
  beforeAll(async () => {
    await updateSettings(userId, { quietStart: "22:00", quietEnd: "07:00" });
  });

  it("holds a one-off reminder until quiet hours end", async () => {
    const r = await createReminder(userId, { message: "Late thought", fireAt: new Date("2026-10-20T21:30:00Z") }); // 23:30 Berlin
    const send = vi.fn(async () => ({ sent: 1 }));
    const outcome = await fireReminder(r.id, { now: new Date("2026-10-20T21:30:05Z"), send });
    expect(outcome).toEqual({ status: "deferred", until: new Date("2026-10-21T05:00:00Z") }); // 07:00 Berlin
    expect(send).not.toHaveBeenCalled();
    expect(await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "snoozed" });

    // At 07:00 it goes out.
    expect(await fireReminder(r.id, { now: new Date("2026-10-21T05:00:01Z"), send })).toMatchObject({
      status: "fired",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps a recurring reminder's schedule and delivers this occurrence via a one-off copy", async () => {
    const r = await createReminder(userId, {
      message: "Night pills",
      fireAt: new Date("2026-10-20T21:00:00Z"), // 23:00 Berlin
      recurrenceRule: "FREQ=DAILY",
    });
    const outcome = await fireReminder(r.id, {
      now: new Date("2026-10-20T21:00:02Z"),
      send: vi.fn(async () => ({ sent: 1 })),
    });
    expect(outcome).toMatchObject({ status: "deferred" });

    const series = await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(series.fireAt.toISOString()).toBe("2026-10-21T21:00:00.000Z"); // still 23:00 tomorrow
    const copy = await prisma.reminder.findFirstOrThrow({
      where: { userId, message: "Night pills", id: { not: r.id } },
    });
    expect(copy).toMatchObject({ recurrenceRule: null, status: "snoozed" });
    expect(copy.fireAt.toISOString()).toBe("2026-10-21T05:00:00.000Z");
  });
});

describe("chat storage", () => {
  it("returns one current chat, saves a bounded history, and starts fresh on New chat", async () => {
    const chat = await getCurrentChat(userId);
    expect((await getCurrentChat(userId)).id).toBe(chat.id);

    const msgs: UIMessage[] = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? "assistant" : "user",
      parts: [{ type: "text", text: `hi ${i}` }],
    }));
    await saveChatMessages(chat.id, msgs);
    const stored = chatMessages(await getCurrentChat(userId));
    expect(stored).toHaveLength(MAX_STORED_MESSAGES);
    expect(stored[0].id).toBe("m5");

    const fresh = await startNewChat(userId);
    expect((await getCurrentChat(userId)).id).toBe(fresh.id);
    expect(chatMessages(fresh)).toEqual([]);
  });
});
