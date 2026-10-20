import { prisma } from "@/lib/db";
import { sendPushToUser, type PushPayload } from "@/lib/push";
import { buildBriefing } from "@/lib/planning/briefing";
import { nextOccurrence } from "@/lib/recurrence";
import { syncReminderSchedule, syncReminderScheduleById } from "@/lib/reminders/scheduler";
import { quietUntil } from "@/lib/settings";
import { addDays, atLocal, localDate, localMinutes } from "@/lib/time";

// A reminder counts as "missed" if it's delivered this late (server down, run lost, etc.).
const MISSED_AFTER_MS = 5 * 60_000;
// Runs may start a little early or late; anything further in the future was rescheduled.
const EARLY_TOLERANCE_MS = 60_000;

export type FireOutcome =
  | {
      status: "skipped";
      reason: "not_found" | "inactive" | "not_due" | "already_claimed";
    }
  | { status: "deferred"; until: Date }
  | { status: "fired"; missed: boolean; sent: number; next: Date | null };

type Deps = {
  now?: Date;
  send?: (userId: string, payload: PushPayload) => Promise<{ sent: number }>;
};

export async function fireReminder(reminderId: string, deps: Deps = {}): Promise<FireOutcome> {
  const now = deps.now ?? new Date();
  const send = deps.send ?? sendPushToUser;

  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
    include: { user: { select: { timezone: true, quietStartMin: true, quietEndMin: true } } },
  });
  if (!reminder) return { status: "skipped", reason: "not_found" };
  if (reminder.status !== "scheduled" && reminder.status !== "snoozed")
    return { status: "skipped", reason: "inactive" };
  if (reminder.fireAt.getTime() - now.getTime() > EARLY_TOLERANCE_MS) return { status: "skipped", reason: "not_due" };

  // Quiet hours: hold delivery until they end.
  const tz = reminder.user.timezone;
  const quietEnd = quietUntil(reminder.user, localMinutes(now, tz));
  let deferUntil: Date | null = null;
  if (quietEnd !== null) {
    const today = localDate(now, tz);
    deferUntil = atLocal(today, quietEnd, tz);
    if (deferUntil <= now) deferUntil = atLocal(addDays(today, 1), quietEnd, tz);
    if (!reminder.recurrenceRule) {
      const moved = await prisma.reminder.updateMany({
        where: { id: reminder.id, fireAt: reminder.fireAt, status: { in: ["scheduled", "snoozed"] } },
        data: { fireAt: deferUntil, status: "snoozed", triggerRunId: null },
      });
      if (moved.count === 0) return { status: "skipped", reason: "already_claimed" };
      await syncReminderScheduleById(reminder.id);
      return { status: "deferred", until: deferUntil };
    }
  }

  // Next fire time for recurring reminders, skipping occurrences already in the past.
  let next: Date | null = null;
  if (reminder.recurrenceRule) {
    next = nextOccurrence(reminder.recurrenceRule, reminder.fireAt, tz);
    while (next && next <= now) next = nextOccurrence(reminder.recurrenceRule, next, tz);
  }

  // Claim atomically so a scheduled run and the sweep can't both deliver it.
  const claimed = await prisma.reminder.updateMany({
    where: {
      id: reminder.id,
      fireAt: reminder.fireAt,
      status: { in: ["scheduled", "snoozed"] },
    },
    data: next
      ? {
          lastFiredAt: now,
          fireAt: next,
          status: "scheduled",
          triggerRunId: null,
        }
      : { lastFiredAt: now, status: "fired", triggerRunId: null },
  });
  if (claimed.count === 0) return { status: "skipped", reason: "already_claimed" };

  // A recurring one keeps its schedule; this occurrence is delivered by a one-off copy after quiet hours.
  if (deferUntil) {
    const copy = await prisma.reminder.create({
      data: {
        userId: reminder.userId,
        taskId: reminder.taskId,
        kind: reminder.kind,
        message: reminder.message,
        fireAt: deferUntil,
        status: "snoozed",
      },
    });
    await syncReminderSchedule(copy);
    if (next) await syncReminderScheduleById(reminder.id);
    return { status: "deferred", until: deferUntil };
  }

  const missed = now.getTime() - reminder.fireAt.getTime() > MISSED_AFTER_MS;
  // Briefings are built fresh at fire time; a stale one (hours late) isn't worth sending.
  const content =
    reminder.kind === "reminder"
      ? {
          title: missed ? "Missed reminder" : "Reminder",
          body: reminder.message,
        }
      : missed
        ? null
        : await buildBriefing(reminder.kind, reminder.userId, now);
  const { sent } = !content
    ? { sent: 0 }
    : await send(reminder.userId, {
        ...content,
        // Done/Snooze buttons only make sense on ordinary reminders.
        reminderId: reminder.kind === "reminder" ? reminder.id : undefined,
        taskId: reminder.taskId,
        tag: `reminder-${reminder.id}`,
      });

  if (next) {
    const updated = await prisma.reminder.findUnique({
      where: { id: reminder.id },
    });
    if (updated) await syncReminderSchedule(updated);
  }

  return { status: "fired", missed, sent, next };
}

// Reminders whose time has passed but that are still active: their delayed run was lost or failed.
export async function findOverdueReminderIds(now: Date = new Date(), graceMs = 60_000, limit = 50): Promise<string[]> {
  const rows = await prisma.reminder.findMany({
    where: {
      status: { in: ["scheduled", "snoozed"] },
      fireAt: { lte: new Date(now.getTime() - graceMs) },
    },
    orderBy: { fireAt: "asc" },
    select: { id: true },
    take: limit,
  });
  return rows.map((r) => r.id);
}
