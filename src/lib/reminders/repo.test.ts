import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { cancelReminder, createReminder, listReminders, snoozeReminder, updateReminder } from "@/lib/reminders/repo";
import { createTask } from "@/lib/tasks/repo";
import { createTestUser } from "@/lib/test-utils";

let userId: string;
let otherUserId: string;
const cleanups: (() => Promise<unknown>)[] = [];

beforeAll(async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  userId = a.userId;
  otherUserId = b.userId;
  cleanups.push(a.cleanup, b.cleanup);
});

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c()));
  await prisma.$disconnect();
});

describe("reminders repo", () => {
  it("creates, lists in fire order, and cancels", async () => {
    const later = await createReminder(userId, { message: "Call mom", fireAt: new Date("2026-10-21T19:00:00Z") });
    const sooner = await createReminder(userId, { message: "Stretch", fireAt: new Date("2026-10-21T10:00:00Z") });
    expect(later).toMatchObject({ status: "scheduled", channels: ["push"] });

    expect((await listReminders(userId)).map((r) => r.id)).toEqual([sooner.id, later.id]);

    await cancelReminder(userId, sooner.id);
    expect((await listReminders(userId)).map((r) => r.id)).toEqual([later.id]);
    expect(await listReminders(userId, { status: "cancelled" })).toHaveLength(1);
  });

  it("links to a task only if I own it", async () => {
    const task = await createTask(userId, { title: "Passport" });
    const r = await createReminder(userId, { message: "Renew", fireAt: new Date(), taskId: task.id });
    expect(r.taskId).toBe(task.id);

    await expect(
      createReminder(otherUserId, { message: "x", fireAt: new Date(), taskId: task.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("snoozes relative to now and re-arms on reschedule", async () => {
    const r = await createReminder(userId, { message: "Tea", fireAt: new Date("2026-10-21T08:00:00Z") });
    const now = new Date("2026-10-21T08:01:00Z");

    const snoozed = await snoozeReminder(userId, r.id, 10, now);
    expect(snoozed.status).toBe("snoozed");
    expect(snoozed.fireAt.toISOString()).toBe("2026-10-21T08:11:00.000Z");

    const moved = await updateReminder(userId, r.id, { fireAt: new Date("2026-10-22T08:00:00Z") });
    expect(moved.status).toBe("scheduled");

    await expect(snoozeReminder(userId, r.id, 0)).rejects.toBeInstanceOf(RangeError);
  });

  it("hides reminders from other users", async () => {
    const r = await createReminder(userId, { message: "Private", fireAt: new Date() });
    await expect(cancelReminder(otherUserId, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
