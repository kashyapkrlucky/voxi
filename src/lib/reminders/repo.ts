import type { Prisma, Reminder } from "@/generated/prisma/client";
import { logAction } from "@/lib/action-log";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { syncReminderSchedule } from "@/lib/reminders/scheduler";
import { completeTask } from "@/lib/tasks/repo";
import { addDays, atLocal, localDate } from "@/lib/time";
import type { ReminderKind } from "@/generated/prisma/enums";
import {
  createReminderInput,
  listRemindersInput,
  updateReminderInput,
  type CreateReminderInput,
  type ListRemindersInput,
  type UpdateReminderInput,
} from "@/lib/reminders/schema";

// Each change is mirrored to a Trigger.dev delayed run (see scheduler.ts) after the transaction commits.

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
  const reminder = await prisma.$transaction(async (tx) => {
    await assertTaskOwned(tx, userId, data.taskId);
    const reminder = await tx.reminder.create({ data: { ...data, userId } });
    await logAction(tx, { userId, tool: "create_reminder", args: data, after: reminder });
    return reminder;
  });
  await syncReminderSchedule(reminder);
  return reminder;
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
  const reminder = await prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    await assertTaskOwned(tx, userId, data.taskId);
    // Moving the fire time re-arms a fired/snoozed reminder.
    const status = data.fireAt ? "scheduled" : undefined;
    const reminder = await tx.reminder.update({ where: { id }, data: { ...data, status } });
    await logAction(tx, { userId, tool: "update_reminder", args: { id, ...data }, before, after: reminder });
    return reminder;
  });
  await syncReminderSchedule(reminder);
  return reminder;
}

export async function cancelReminder(userId: string, id: string): Promise<Reminder> {
  const reminder = await prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    const reminder = await tx.reminder.update({ where: { id }, data: { status: "cancelled" } });
    await logAction(tx, { userId, tool: "cancel_reminder", args: { id }, before, after: reminder });
    return reminder;
  });
  await syncReminderSchedule(reminder);
  return reminder;
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
  const reminder = await prisma.$transaction(async (tx) => {
    const before = await getOwned(tx, userId, id);
    const reminder = await tx.reminder.update({
      where: { id },
      data: { status: "snoozed", fireAt: new Date(now.getTime() + minutes * 60_000) },
    });
    await logAction(tx, { userId, tool: "snooze_reminder", args: { id, minutes }, before, after: reminder });
    return reminder;
  });
  await syncReminderSchedule(reminder);
  return reminder;
}

// "Done" on a notification: completes the linked task, and stops a one-off reminder that's still pending.
export async function acknowledgeReminder(userId: string, id: string): Promise<Reminder> {
  let reminder = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!reminder) throw new NotFoundError("Reminder", id);

  if (reminder.taskId) {
    const task = await prisma.task.findFirst({ where: { id: reminder.taskId, userId, deletedAt: null } });
    if (task && task.status !== "done") await completeTask(userId, task.id);
  }
  if (!reminder.recurrenceRule && (reminder.status === "scheduled" || reminder.status === "snoozed")) {
    reminder = await prisma.reminder.update({ where: { id }, data: { status: "fired", lastFiredAt: new Date() } });
    await syncReminderSchedule(reminder);
  }
  return reminder;
}

const briefingLabel = { morning_briefing: "Morning briefing", evening_review: "Evening review" } as const;

// Turns the daily briefing on at a local time ("07:30"), moves it, or turns it off (null).
export async function setBriefing(
  userId: string,
  kind: Exclude<ReminderKind, "reminder">,
  time: string | null,
  now: Date = new Date(),
): Promise<Reminder | null> {
  const existing = await prisma.reminder.findFirst({
    where: { userId, kind, status: { in: ["scheduled", "snoozed"] } },
    orderBy: { createdAt: "desc" },
  });
  if (time === null) return existing ? cancelReminder(userId, existing.id) : null;

  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m || +m[1] > 23 || +m[2] > 59) throw new RangeError(`Invalid time "${time}", expected HH:MM`);
  const { timezone } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const minutes = +m[1] * 60 + +m[2];
  const today = localDate(now, timezone);
  let fireAt = atLocal(today, minutes, timezone);
  if (fireAt <= now) fireAt = atLocal(addDays(today, 1), minutes, timezone);

  const data = { message: briefingLabel[kind], fireAt, recurrenceRule: "FREQ=DAILY" };
  return existing ? updateReminder(userId, existing.id, data) : createReminder(userId, { ...data, kind });
}
