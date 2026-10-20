import type { Plan, Reminder, Task } from "@/generated/prisma/client";
import { planBlocks, planUnscheduled } from "@/lib/planning/repo";
import { formatLocal, localIso } from "@/lib/time";

export { formatLocal, isoInZone, localIso, parseLocal } from "@/lib/time";

// Compact shapes for tool results: fewer tokens, no internal fields.
export function taskView(task: Task, timeZone: string) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due: task.dueAt ? formatLocal(task.dueAt, timeZone) : null,
    dueAt: task.dueAt ? localIso(task.dueAt, timeZone) : null,
    ...(task.notes ? { notes: task.notes } : {}),
    ...(task.project ? { project: task.project } : {}),
    ...(task.tags.length ? { tags: task.tags } : {}),
    ...(task.estimateMin ? { estimateMin: task.estimateMin } : {}),
    ...(task.recurrenceRule ? { recurrenceRule: task.recurrenceRule } : {}),
  };
}

export function reminderView(reminder: Reminder, timeZone: string) {
  return {
    id: reminder.id,
    message: reminder.message,
    ...(reminder.kind !== "reminder" ? { kind: reminder.kind } : {}),
    status: reminder.status,
    fires: formatLocal(reminder.fireAt, timeZone),
    fireAt: localIso(reminder.fireAt, timeZone),
    ...(reminder.recurrenceRule ? { recurrenceRule: reminder.recurrenceRule } : {}),
    ...(reminder.taskId ? { taskId: reminder.taskId } : {}),
  };
}

export function planView(plan: Plan, freeMinutes: number | null, timeZone: string) {
  const unscheduled = planUnscheduled(plan);
  const hm = (iso: string) => localIso(new Date(iso), timeZone).slice(11);
  const multiDay = plan.days > 1;
  return {
    planId: plan.id,
    status: plan.status,
    date: plan.date,
    days: plan.days,
    blocks: planBlocks(plan).map((b) => ({
      taskId: b.taskId,
      title: b.title,
      ...(multiDay ? { day: formatLocal(new Date(b.start), timeZone).slice(0, 11) } : {}),
      start: hm(b.start),
      end: hm(b.end),
      why: b.reason,
    })),
    notScheduled: unscheduled.slice(0, 8).map((u) => ({ taskId: u.taskId, title: u.title, why: u.reason })),
    ...(unscheduled.length > 8 ? { moreNotScheduled: unscheduled.length - 8 } : {}),
    ...(freeMinutes !== null ? { freeMinutesLeft: freeMinutes } : {}),
  };
}
