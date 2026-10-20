import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { findOverdueReminderIds, fireReminder } from "@/lib/reminders/fire";
import { acknowledgeReminder, cancelReminder, createReminder } from "@/lib/reminders/repo";
import { createTask, getTask } from "@/lib/tasks/repo";
import { createTestUser } from "@/lib/test-utils";

let userId: string;
let cleanup: () => Promise<unknown>;

beforeAll(async () => {
  ({ userId, cleanup } = await createTestUser());
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const fakeSend = () => vi.fn(async () => ({ sent: 1 }));

describe("fireReminder", () => {
  it("delivers a due one-off reminder exactly once", async () => {
    const r = await createReminder(userId, { message: "Call mom", fireAt: new Date("2026-10-21T17:00:00Z") });
    const send = fakeSend();
    const now = new Date("2026-10-21T17:00:05Z");

    expect(await fireReminder(r.id, { now, send })).toEqual({ status: "fired", missed: false, sent: 1, next: null });
    expect(send).toHaveBeenCalledWith(userId, expect.objectContaining({ title: "Reminder", body: "Call mom", reminderId: r.id }));
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("fired");

    // A second run (e.g. the sweep racing the scheduled run) does nothing.
    expect(await fireReminder(r.id, { now, send })).toEqual({ status: "skipped", reason: "inactive" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips reminders moved later or cancelled", async () => {
    const send = fakeSend();
    const later = await createReminder(userId, { message: "Later", fireAt: new Date("2026-10-21T18:00:00Z") });
    expect(await fireReminder(later.id, { now: new Date("2026-10-21T17:00:00Z"), send })).toEqual({
      status: "skipped",
      reason: "not_due",
    });

    await cancelReminder(userId, later.id);
    expect(await fireReminder(later.id, { now: new Date("2026-10-21T18:00:00Z"), send })).toMatchObject({ reason: "inactive" });
    expect(await fireReminder("missing", { send })).toMatchObject({ reason: "not_found" });
    expect(send).not.toHaveBeenCalled();
  });

  it("labels late deliveries as missed", async () => {
    const r = await createReminder(userId, { message: "Stretch", fireAt: new Date("2026-10-21T08:00:00Z") });
    const send = fakeSend();
    const outcome = await fireReminder(r.id, { now: new Date("2026-10-21T09:00:00Z"), send });
    expect(outcome).toMatchObject({ status: "fired", missed: true });
    expect(send).toHaveBeenCalledWith(userId, expect.objectContaining({ title: "Missed reminder" }));
  });

  it("re-arms recurring reminders at the next future occurrence", async () => {
    const r = await createReminder(userId, {
      message: "Timesheet",
      fireAt: new Date("2026-10-19T08:00:00Z"),
      recurrenceRule: "FREQ=WEEKLY",
    });
    // Delivered very late: skips the missed weeks and lands on the next one after now.
    const outcome = await fireReminder(r.id, { now: new Date("2026-11-03T12:00:00Z"), send: fakeSend() });
    expect(outcome).toMatchObject({ status: "fired", missed: true });

    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("scheduled");
    expect(after.fireAt.toISOString()).toBe("2026-11-09T08:00:00.000Z");
    expect(after.lastFiredAt?.toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });
});

describe("findOverdueReminderIds", () => {
  it("returns active reminders past their time, beyond the grace period", async () => {
    const { userId: uid, cleanup: done } = await createTestUser();
    const overdue = await createReminder(uid, { message: "a", fireAt: new Date("2000-01-01T00:00:00Z") });
    await createReminder(uid, { message: "b", fireAt: new Date("2100-01-01T00:00:00Z") });
    const cancelled = await createReminder(uid, { message: "c", fireAt: new Date("2000-01-01T00:00:00Z") });
    await cancelReminder(uid, cancelled.id);

    const ids = await findOverdueReminderIds(new Date(), 60_000, 200);
    expect(ids).toContain(overdue.id);
    expect(ids).not.toContain(cancelled.id);
    await done();
  });
});

describe("acknowledgeReminder", () => {
  it("completes the linked task and stops a pending one-off reminder", async () => {
    const task = await createTask(userId, { title: "Renew passport" });
    const r = await createReminder(userId, { message: "Renew passport", fireAt: new Date("2026-10-30T09:00:00Z"), taskId: task.id });

    expect((await acknowledgeReminder(userId, r.id)).status).toBe("fired");
    expect((await getTask(userId, task.id)).status).toBe("done");
  });
});
