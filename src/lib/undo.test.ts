import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cancelReminder, createReminder, snoozeReminder } from "@/lib/reminders/repo";
import { completeTask, createTask, deleteTask, findTasks, getTask, updateTask } from "@/lib/tasks/repo";
import { createTestUser } from "@/lib/test-utils";
import { undoLast } from "@/lib/undo";

let userId: string;
let cleanup: () => Promise<unknown>;

beforeAll(async () => {
  ({ userId, cleanup } = await createTestUser());
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("undoLast", () => {
  it("undoes create, update, and delete of a task in order", async () => {
    const task = await createTask(userId, { title: "Draft", priority: "low" });
    await updateTask(userId, task.id, { title: "Final", priority: "high" });
    await deleteTask(userId, task.id);

    expect(await undoLast(userId)).toEqual([{ tool: "delete_task", summary: 'Restored task "Final"' }]);
    expect((await getTask(userId, task.id)).title).toBe("Final");

    await undoLast(userId);
    expect(await getTask(userId, task.id)).toMatchObject({ title: "Draft", priority: "low" });

    await undoLast(userId);
    expect(await findTasks(userId, { query: "Draft" })).toHaveLength(0);
  });

  it("undoing completion of a recurring task removes the spawned instance", async () => {
    const task = await createTask(userId, {
      title: "Water plants",
      dueAt: new Date("2026-10-19T08:00:00Z"),
      recurrenceRule: "FREQ=DAILY",
    });
    const { next } = await completeTask(userId, task.id);

    await undoLast(userId);
    expect(await getTask(userId, task.id)).toMatchObject({ status: "todo", completedAt: null });
    await expect(getTask(userId, next!.id)).rejects.toThrow();
  });

  it("undoes several reminder steps at once", async () => {
    const r = await createReminder(userId, { message: "Tea", fireAt: new Date("2026-10-21T08:00:00Z") });
    await snoozeReminder(userId, r.id, 10, new Date("2026-10-21T08:00:00Z"));
    await cancelReminder(userId, r.id);

    const undone = await undoLast(userId, 2);
    expect(undone.map((u) => u.tool)).toEqual(["cancel_reminder", "snooze_reminder"]);
    const restored = await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(restored).toMatchObject({ status: "scheduled" });
    expect(restored.fireAt.toISOString()).toBe("2026-10-21T08:00:00.000Z");
  });

  it("returns nothing when there is nothing to undo", async () => {
    const { userId: fresh, cleanup: done } = await createTestUser();
    expect(await undoLast(fresh)).toEqual([]);
    await done();
  });
});
