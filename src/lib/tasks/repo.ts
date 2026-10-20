import type { Prisma, Task } from "@/generated/prisma/client";
import { logAction } from "@/lib/action-log";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { nextOccurrence } from "@/lib/recurrence";
import {
  createTaskInput,
  findTasksInput,
  updateTaskInput,
  type CreateTaskInput,
  type FindTasksInput,
  type UpdateTaskInput,
} from "@/lib/tasks/schema";

const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

async function getOwned(tx: Prisma.TransactionClient, userId: string, id: string): Promise<Task> {
  const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null } });
  if (!task) throw new NotFoundError("Task", id);
  return task;
}

export async function getTask(userId: string, id: string): Promise<Task> {
  return getOwned(prisma, userId, id);
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<Task> {
  const data = createTaskInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data: { ...data, userId } });
    await logAction(tx, { userId, tool: "create_task", args: data, after: task });
    return task;
  });
}

export async function updateTask(userId: string, id: string, input: UpdateTaskInput): Promise<Task> {
  const data = updateTaskInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    const completedAt =
      data.status === undefined ? undefined : data.status === "done" ? (before.completedAt ?? new Date()) : null;
    const task = await tx.task.update({ where: { id }, data: { ...data, completedAt } });
    await logAction(tx, { userId, tool: "update_task", args: { id, ...data }, before, after: task });
    return task;
  });
}

// Soft delete so it can be undone.
export async function deleteTask(userId: string, id: string): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    const task = await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAction(tx, { userId, tool: "delete_task", args: { id }, before, after: task });
    return task;
  });
}

// Marks done; for recurring tasks with a due date, also creates the next instance.
export async function completeTask(userId: string, id: string): Promise<{ task: Task; next: Task | null }> {
  return prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    const task = await tx.task.update({
      where: { id },
      data: { status: "done", completedAt: before.completedAt ?? new Date() },
    });

    let next: Task | null = null;
    const nextDue = before.recurrenceRule && before.dueAt ? nextOccurrence(before.recurrenceRule, before.dueAt) : null;
    if (before.status !== "done" && nextDue) {
      next = await tx.task.create({
        data: {
          userId,
          title: before.title,
          notes: before.notes,
          priority: before.priority,
          dueAt: nextDue,
          estimateMin: before.estimateMin,
          project: before.project,
          tags: before.tags,
          recurrenceRule: before.recurrenceRule,
          parentId: before.parentId,
        },
      });
    }

    await logAction(tx, { userId, tool: "complete_task", args: { id }, before, after: { task, next } });
    return { task, next };
  });
}

export async function findTasks(userId: string, input: FindTasksInput = {}): Promise<Task[]> {
  const f = findTasksInput.parse(input);
  const now = new Date();

  const where: Prisma.TaskWhereInput = { userId, deletedAt: null };
  if (f.status) where.status = f.status;
  else if (!f.includeDone) where.status = { in: ["todo", "in_progress"] };
  if (f.project) where.project = { equals: f.project, mode: "insensitive" };
  if (f.tag) where.tags = { has: f.tag };
  if (f.query) {
    where.OR = [
      { title: { contains: f.query, mode: "insensitive" } },
      { notes: { contains: f.query, mode: "insensitive" } },
    ];
  }
  const dueAt: Prisma.DateTimeNullableFilter = {};
  if (f.dueAfter) dueAt.gte = f.dueAfter;
  if (f.dueBefore) dueAt.lt = f.dueBefore;
  if (f.overdue) dueAt.lt = f.dueBefore && f.dueBefore < now ? f.dueBefore : now;
  if (Object.keys(dueAt).length) where.dueAt = dueAt;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: f.limit ?? 100,
  });

  // Same due date → higher priority first.
  return tasks.sort((a, b) => {
    const ad = a.dueAt?.getTime() ?? Infinity;
    const bd = b.dueAt?.getTime() ?? Infinity;
    return ad - bd || priorityRank[a.priority] - priorityRank[b.priority];
  });
}
