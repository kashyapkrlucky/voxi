import type { Priority } from "@/generated/prisma/enums";
import { addDays, atLocal, localDate, weekdayName } from "@/lib/time";

// Deterministic planner (plan.md §7): score open tasks, then fit them into free time.
// The agent only explains and edits the result; it never invents the schedule itself.

export type PlanTask = {
  id: string;
  title: string;
  priority: Priority;
  dueAt: Date | null;
  estimateMin: number | null;
  createdAt: Date;
};

export type PlanInput = {
  tasks: PlanTask[];
  now: Date;
  timeZone: string;
  startDay: string; // local "YYYY-MM-DD"
  days: number;
  workStartMin: number;
  workEndMin: number;
  // "I have 2 hours this evening": an explicit window replaces working hours (single day).
  windowStart?: Date;
  windowEnd?: Date;
  availableMinutes?: number;
  pinIds?: string[]; // placed first, in this order
  excludeIds?: string[];
};

export type Block = { taskId: string; title: string; start: Date; end: Date; reason: string };
export type Unscheduled = { taskId: string; title: string; reason: string };
export type PlanResult = { blocks: Block[]; unscheduled: Unscheduled[]; freeMinutes: number };

export const DEFAULT_ESTIMATE_MIN = 30;
const BUFFER_MIN = 5;
// Start times round up to 5 minutes: coarser rounding eats noticeably into short free windows.
const SLOT_MIN = 5;
const DAY_MS = 86_400_000;

const priorityWeight: Record<Priority, number> = { urgent: 40, high: 25, medium: 10, low: 0 };

function score(task: PlanTask, now: Date, horizonEnd: Date): number {
  let s = priorityWeight[task.priority];
  if (task.dueAt) {
    const daysLeft = (task.dueAt.getTime() - now.getTime()) / DAY_MS;
    if (daysLeft < 0) s += 50 + Math.min(-daysLeft * 5, 20);
    else if (task.dueAt <= horizonEnd) s += 35;
    else if (daysLeft <= 3) s += 20;
    else if (daysLeft <= 7) s += 10;
  }
  s += Math.min((now.getTime() - task.createdAt.getTime()) / DAY_MS, 14) * 0.5;
  s -= ((task.estimateMin ?? DEFAULT_ESTIMATE_MIN) / 60) * 2; // nudge quick wins up
  return s;
}

function reasonFor(task: PlanTask, now: Date, timeZone: string): string {
  const parts: string[] = [];
  if (task.dueAt) {
    const due = localDate(task.dueAt, timeZone);
    const today = localDate(now, timeZone);
    if (task.dueAt < now) parts.push("overdue");
    else if (due === today) parts.push("due today");
    else if (due === addDays(today, 1)) parts.push("due tomorrow");
    else parts.push(`due ${weekdayName(due)}`);
  }
  if (task.priority === "urgent" || task.priority === "high") parts.push(`${task.priority} priority`);
  return parts.join(", ") || "open task";
}

const roundUp = (d: Date, minutes: number) => new Date(Math.ceil(d.getTime() / (minutes * 60_000)) * minutes * 60_000);

type Day = { day: string; cursor: Date; end: Date };

function buildDays(input: PlanInput): Day[] {
  const { now, timeZone } = input;
  if (input.windowStart && input.windowEnd) {
    const start = input.windowStart > now ? input.windowStart : roundUp(now, SLOT_MIN);
    return [{ day: localDate(start, timeZone), cursor: start, end: input.windowEnd }];
  }
  const days: Day[] = [];
  for (let i = 0; i < input.days; i++) {
    const day = addDays(input.startDay, i);
    const dayStart = atLocal(day, input.workStartMin, timeZone);
    const end = atLocal(day, input.workEndMin, timeZone);
    const cursor = dayStart > now ? dayStart : roundUp(now, SLOT_MIN);
    if (cursor < end) days.push({ day, cursor, end });
  }
  return days;
}

export function buildPlan(input: PlanInput): PlanResult {
  const { now, timeZone } = input;
  const days = buildDays(input);
  const horizonEnd = days.at(-1)?.end ?? now;
  const excluded = new Set(input.excludeIds ?? []);
  const pins = input.pinIds ?? [];

  const candidates = input.tasks
    .filter((t) => !excluded.has(t.id))
    .map((t) => ({ task: t, score: score(t, now, horizonEnd), pin: pins.indexOf(t.id) }))
    .sort((a, b) => {
      if (a.pin !== -1 || b.pin !== -1) return (a.pin === -1 ? Infinity : a.pin) - (b.pin === -1 ? Infinity : b.pin);
      return b.score - a.score;
    });

  let budget = input.availableMinutes ?? Infinity;
  const blocks: Block[] = [];
  const unscheduled: Unscheduled[] = [];

  for (const { task } of candidates) {
    const minutes = task.estimateMin ?? DEFAULT_ESTIMATE_MIN;
    const fits = (d: Day) => d.cursor.getTime() + minutes * 60_000 <= d.end.getTime();

    if (minutes > budget) {
      unscheduled.push({ taskId: task.id, title: task.title, reason: "no time left" });
      continue;
    }
    // Prefer a day on or before the due date; otherwise the first day it fits at all.
    const dueDay = task.dueAt ? localDate(task.dueAt, timeZone) : null;
    const day = days.find((d) => fits(d) && (!dueDay || d.day <= dueDay)) ?? days.find(fits);
    if (!day) {
      const longest = Math.max(0, ...days.map((d) => (d.end.getTime() - d.cursor.getTime()) / 60_000));
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: minutes > longest && blocks.length === 0 ? "longer than the free time" : "no time left",
      });
      continue;
    }

    const start = day.cursor;
    const end = new Date(start.getTime() + minutes * 60_000);
    blocks.push({ taskId: task.id, title: task.title, start, end, reason: reasonFor(task, now, timeZone) });
    day.cursor = roundUp(new Date(end.getTime() + BUFFER_MIN * 60_000), 5);
    budget -= minutes;
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
  const freeMinutes = Math.round(days.reduce((sum, d) => sum + Math.max(0, d.end.getTime() - d.cursor.getTime()), 0) / 60_000);
  return { blocks, unscheduled, freeMinutes };
}
