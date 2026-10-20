import type { Prisma, Reminder } from "@/generated/prisma/client";
import { logAction } from "@/lib/action-log";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import {
  createReminderInput,
  listRemindersInput,
  updateReminderInput,
  type CreateReminderInput,
  type ListRemindersInput,
  type UpdateReminderInput,
} from "@/lib/reminders/schema";

// Scheduling the actual delivery (Trigger.dev delayed runs) arrives in Phase 3;
// for now these functions only manage the rows.

async function getOwned(tx: Prisma.TransactionClient, userId: string, id: string): Promise<Reminder> {
  const reminder = await tx.reminder.findFirst({ where: { id, userId } });
  if (!reminder) throw new NotFoundError("Reminder", id);
  return reminder;
}

async function assertTaskOwned(tx: Prisma.TransactionClient, userId: string, taskId: string | null | undefined) {
  if (!taskId) return;
  const task = await tx.task.findFirst({ where: { id: taskId, userId, deletedAt: null }, select: { id: true } });
  if (!task) throw new NotFoundError("Task", taskId);
}

export async function createReminder(userId: string, input: CreateReminderInput): Promise<Reminder> {
  const data = createReminderInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await assertTaskOwned(tx, userId, data.taskId);
    const reminder = await tx.reminder.create({ data: { ...data, userId } });
    await logAction(tx, { userId, tool: "create_reminder", args: data, after: reminder });
    return reminder;
  });
}

export async function listReminders(userId: string, input: ListRemindersInput = {}): Promise<Reminder[]> {
  const f = listRemindersInput.parse(input);
  const fireAt: Prisma.DateTimeFilter = {};
  if (f.from) fireAt.gte = f.from;
  if (f.to) fireAt.lt = f.to;

  return prisma.reminder.findMany({
    where: {
      userId,
      status: f.status ?? { in: ["scheduled", "snoozed"] },
      ...(Object.keys(fireAt).length ? { fireAt } : {}),
    },
    orderBy: { fireAt: "asc" },
    take: f.limit ?? 100,
  });
}

export async function updateReminder(userId: string, id: string, input: UpdateReminderInput): Promise<Reminder> {
  const data = updateReminderInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    await assertTaskOwned(tx, userId, data.taskId);
    // Moving the fire time re-arms a fired/snoozed reminder.
    const status = data.fireAt ? "scheduled" : undefined;
    const reminder = await tx.reminder.update({ where: { id }, data: { ...data, status } });
    await logAction(tx, { userId, tool: "update_reminder", args: { id, ...data }, before, after: reminder });
    return reminder;
  });
}

export async function cancelReminder(userId: string, id: string): Promise<Reminder> {
  return prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    const reminder = await tx.reminder.update({ where: { id }, data: { status: "cancelled" } });
    await logAction(tx, { userId, tool: "cancel_reminder", args: { id }, before, after: reminder });
    return reminder;
  });
}

export async function snoozeReminder(
  userId: string,
  id: string,
  minutes: number,
  now: Date = new Date(),
): Promise<Reminder> {
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) {
    throw new RangeError("minutes must be an integer between 1 and 1440");
  }
  return prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    const reminder = await tx.reminder.update({
      where: { id },
      data: { status: "snoozed", fireAt: new Date(now.getTime() + minutes * 60_000) },
    });
    await logAction(tx, { userId, tool: "snooze_reminder", args: { id, minutes }, before, after: reminder });
    return reminder;
  });
}
