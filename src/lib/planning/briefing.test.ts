import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { buildBriefing } from "@/lib/planning/briefing";
import { fireReminder } from "@/lib/reminders/fire";
import { setBriefing } from "@/lib/reminders/repo";
import { completeTask, createTask } from "@/lib/tasks/repo";
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

describe("briefings", () => {
  it("morning: summarises today's draft plan", async () => {
    const now = new Date("2026-10-20T05:30:00Z"); // 07:30 Berlin
    await createTask(userId, { title: "Submit report", dueAt: new Date("2026-10-19T10:00:00Z"), estimateMin: 60 });
    await createTask(userId, { title: "Call dentist", estimateMin: 15 });

    const { title, body } = await buildBriefing("morning_briefing", userId, now);
    expect(title).toBe("Good morning");
    expect(body).toBe("2 tasks today, starting with Submit report at 09:00. 1 overdue. Open Voxi to lock in the plan.");
  });

  it("evening: counts what's done and lists what's left", async () => {
    const [report] = await prisma.task.findMany({ where: { userId, title: "Submit report" } });
    await completeTask(userId, report.id);
    await createTask(userId, { title: "Pay bill", dueAt: new Date("2026-10-20T15:00:00Z") });

    // completedAt is "now" (real clock), so ask about the real current day.
    const { title, body } = await buildBriefing("evening_review", userId, new Date());
    expect(title).toBe("Evening review");
    expect(body).toMatch(/^You finished 1 task today\./);
  });

  it("setBriefing creates a daily reminder at the next local time, moves it, and turns it off", async () => {
    const now = new Date("2026-10-20T06:00:00Z"); // 08:00 Berlin, so 07:30 is tomorrow
    const r = await setBriefing(userId, "morning_briefing", "07:30", now);
    expect(r).toMatchObject({ kind: "morning_briefing", recurrenceRule: "FREQ=DAILY", status: "scheduled" });
    expect(r!.fireAt.toISOString()).toBe("2026-10-21T05:30:00.000Z");

    const moved = await setBriefing(userId, "morning_briefing", "09:15", now);
    expect(moved!.id).toBe(r!.id);
    expect(moved!.fireAt.toISOString()).toBe("2026-10-20T07:15:00.000Z");

    expect((await setBriefing(userId, "morning_briefing", null, now))!.status).toBe("cancelled");
    expect(await setBriefing(userId, "morning_briefing", null, now)).toBeNull();
    await expect(setBriefing(userId, "evening_review", "25:00", now)).rejects.toBeInstanceOf(RangeError);
  });

  it("fires a briefing with built content and no Done/Snooze, then re-arms for tomorrow", async () => {
    const now = new Date("2026-10-21T05:00:00Z");
    const r = await setBriefing(userId, "evening_review", "07:00", new Date("2026-10-21T04:00:00Z"));
    const send = vi.fn(async () => ({ sent: 1 }));

    const outcome = await fireReminder(r!.id, { now, send });
    expect(outcome).toMatchObject({ status: "fired", missed: false });
    expect(send).toHaveBeenCalledWith(userId, expect.objectContaining({ title: "Evening review", reminderId: undefined }));
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r!.id } })).fireAt.toISOString()).toBe(
      "2026-10-22T05:00:00.000Z",
    );
  });
});
