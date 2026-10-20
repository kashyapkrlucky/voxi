import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { completeTask, createTask, deleteTask, findTasks, getTask, updateTask } from "@/lib/tasks/repo";
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

describe("tasks repo", () => {
  it("creates a task with defaults and logs the action", async () => {
    const task = await createTask(userId, { title: "  Buy milk  " });
    expect(task).toMatchObject({ title: "Buy milk", status: "todo", priority: "medium", tags: [] });

    const log = await prisma.actionLog.findFirst({ where: { userId, tool: "create_task" } });
    expect(log?.after).toMatchObject({ id: task.id });
  });

  it("rejects invalid input", async () => {
    await expect(createTask(userId, { title: "" })).rejects.toThrow();
    await expect(createTask(userId, { title: "x", recurrenceRule: "every day" })).rejects.toThrow();
  });

  it("updates fields and tracks completedAt with status", async () => {
    const task = await createTask(userId, { title: "Slides" });
    const updated = await updateTask(userId, task.id, { priority: "high", status: "done" });
    expect(updated.priority).toBe("high");
    expect(updated.completedAt).toBeInstanceOf(Date);

    const reopened = await updateTask(userId, task.id, { status: "todo" });
    expect(reopened.completedAt).toBeNull();
  });

  it("soft-deletes and hides deleted tasks", async () => {
    const task = await createTask(userId, { title: "Delete me" });
    await deleteTask(userId, task.id);
    await expect(getTask(userId, task.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.task.findUnique({ where: { id: task.id } }))?.deletedAt).toBeInstanceOf(Date);
  });

  it("does not let another user touch my tasks", async () => {
    const task = await createTask(userId, { title: "Mine" });
    await expect(updateTask(otherUserId, task.id, { title: "Theirs" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTask(otherUserId, task.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await findTasks(otherUserId, { query: "Mine" })).toHaveLength(0);
  });

  it("completing a recurring task creates the next instance once", async () => {
    const dueAt = new Date("2026-10-19T09:00:00Z");
    const task = await createTask(userId, { title: "Timesheet", dueAt, recurrenceRule: "FREQ=WEEKLY" });

    const first = await completeTask(userId, task.id);
    expect(first.task.status).toBe("done");
    expect(first.next?.dueAt?.toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(first.next?.recurrenceRule).toBe("FREQ=WEEKLY");

    const again = await completeTask(userId, task.id);
    expect(again.next).toBeNull();
  });

  it("finds tasks by text, overdue, and status", async () => {
    const { userId: uid, cleanup } = await createTestUser();
    cleanups.push(cleanup);
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);

    const overdue = await createTask(uid, { title: "Call dentist", dueAt: past });
    const later = await createTask(uid, { title: "Pay dentist bill", dueAt: future, priority: "high" });
    const noDue = await createTask(uid, { title: "Read book" });
    const done = await createTask(uid, { title: "Old dentist thing" });
    await completeTask(uid, done.id);

    expect((await findTasks(uid)).map((t) => t.id)).toEqual([overdue.id, later.id, noDue.id]);
    expect((await findTasks(uid, { query: "DENTIST" })).map((t) => t.id)).toEqual([overdue.id, later.id]);
    expect((await findTasks(uid, { overdue: true })).map((t) => t.id)).toEqual([overdue.id]);
    expect((await findTasks(uid, { status: "done" })).map((t) => t.id)).toEqual([done.id]);
    expect(await findTasks(uid, { query: "dentist", includeDone: true })).toHaveLength(3);
  });
});
