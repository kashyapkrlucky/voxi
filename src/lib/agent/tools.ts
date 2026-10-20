import { tool } from "ai";
import { z } from "zod";
import { parseLocal, planView, reminderView, taskView } from "@/lib/agent/format";
import { acceptPlan, getPlanForDay, proposePlan } from "@/lib/planning/repo";
import { localDate } from "@/lib/time";
import {
  cancelReminder,
  createReminder,
  listReminders,
  setBriefing,
  snoozeReminder,
  updateReminder,
} from "@/lib/reminders/repo";
import { completeTask, createTask, deleteTask, findTasks, updateTask } from "@/lib/tasks/repo";
import { priorities, taskStatuses } from "@/lib/tasks/schema";
import { undoLast } from "@/lib/undo";

const isoTime = z.string().describe("Local date-time in the user's timezone, no offset, e.g. 2026-10-26T09:00");
const rrule = z
  .string()
  .describe("iCalendar RRULE without DTSTART, e.g. FREQ=WEEKLY;BYDAY=MO or FREQ=DAILY;INTERVAL=2");

// Tool failures go back to the model as data so it can recover or tell the user.
async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// `now` is fixed only in evals; in the app every call uses the live clock.
export function buildTools(userId: string, timeZone: string, now?: Date) {
  const clock = () => now ?? new Date();
  // Converts the model's local wall-clock times to instants; the server owns DST math.
  const at = <T extends string | null | undefined>(v: T) =>
    (typeof v === "string" ? parseLocal(v, timeZone) : v) as T extends string ? Date : T;
  const t = (task: Parameters<typeof taskView>[0]) => taskView(task, timeZone);
  const r = (reminder: Parameters<typeof reminderView>[0]) => reminderView(reminder, timeZone);

  return {
    find_tasks: tool({
      description:
        "Search the user's tasks. Use before updating, completing or deleting to get the task id. " +
        "By default returns open tasks (todo/in_progress) sorted by due date.",
      inputSchema: z.object({
        query: z.string().optional().describe("Words to match in title or notes"),
        status: z.enum(taskStatuses).optional(),
        project: z.string().optional(),
        tag: z.string().optional(),
        dueBefore: isoTime.optional(),
        dueAfter: isoTime.optional(),
        overdue: z.boolean().optional(),
        includeDone: z.boolean().optional().describe("Include done/cancelled tasks"),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: ({ dueBefore, dueAfter, ...rest }) =>
        safe(async () =>
          (await findTasks(userId, { ...rest, dueBefore: at(dueBefore), dueAfter: at(dueAfter) })).map(t),
        ),
    }),

    create_task: tool({
      description: "Create a new task.",
      inputSchema: z.object({
        title: z.string().describe("Short task title, without the date/priority words"),
        notes: z.string().optional(),
        priority: z.enum(priorities).optional().describe("Default medium"),
        dueAt: isoTime.optional(),
        estimateMin: z.number().int().positive().optional().describe("Estimated minutes"),
        project: z.string().optional(),
        tags: z.array(z.string()).optional(),
        recurrenceRule: rrule.optional(),
      }),
      execute: ({ dueAt, ...rest }) => safe(async () => t(await createTask(userId, { ...rest, dueAt: at(dueAt) }))),
    }),

    update_task: tool({
      description: "Change fields of an existing task. Pass null to clear a field (e.g. dueAt: null).",
      inputSchema: z.object({
        id: z.string(),
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        priority: z.enum(priorities).optional(),
        status: z.enum(taskStatuses).optional(),
        dueAt: isoTime.nullable().optional(),
        estimateMin: z.number().int().positive().nullable().optional(),
        project: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        recurrenceRule: rrule.nullable().optional(),
      }),
      execute: ({ id, dueAt, ...patch }) =>
        safe(async () => t(await updateTask(userId, id, { ...patch, dueAt: at(dueAt) }))),
    }),

    complete_task: tool({
      description: "Mark a task done. Recurring tasks automatically get their next instance.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) =>
        safe(async () => {
          const { task, next } = await completeTask(userId, id);
          return { task: t(task), next: next ? t(next) : null };
        }),
    }),

    delete_task: tool({
      description: "Delete a task (can be undone).",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => safe(async () => ({ deleted: t(await deleteTask(userId, id)) })),
    }),

    list_reminders: tool({
      description: "List upcoming reminders (scheduled or snoozed by default), soonest first.",
      inputSchema: z.object({
        from: isoTime.optional(),
        to: isoTime.optional(),
        status: z.enum(["scheduled", "fired", "snoozed", "cancelled"]).optional(),
      }),
      execute: ({ from, to, status }) =>
        safe(async () => (await listReminders(userId, { status, from: at(from), to: at(to) })).map(r)),
    }),

    create_reminder: tool({
      description:
        "Create a reminder that notifies the user at a time. Use for 'remind me ...'. " +
        "Optionally link it to an existing task.",
      inputSchema: z.object({
        message: z.string().describe("What to remind about, phrased as the notification text"),
        fireAt: isoTime,
        recurrenceRule: rrule.optional(),
        taskId: z.string().optional(),
      }),
      execute: ({ fireAt, ...rest }) =>
        safe(async () => r(await createReminder(userId, { ...rest, fireAt: at(fireAt) }))),
    }),

    update_reminder: tool({
      description: "Change a reminder's time, text or recurrence.",
      inputSchema: z.object({
        id: z.string(),
        message: z.string().optional(),
        fireAt: isoTime.optional(),
        recurrenceRule: rrule.nullable().optional(),
      }),
      execute: ({ id, fireAt, ...patch }) =>
        safe(async () => r(await updateReminder(userId, id, { ...patch, fireAt: at(fireAt) }))),
    }),

    cancel_reminder: tool({
      description: "Cancel a reminder.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => safe(async () => r(await cancelReminder(userId, id))),
    }),

    snooze_reminder: tool({
      description: "Push a reminder later by some minutes from now.",
      inputSchema: z.object({ id: z.string(), minutes: z.number().int().positive().max(1440) }),
      execute: ({ id, minutes }) => safe(async () => r(await snoozeReminder(userId, id, minutes, clock()))),
    }),

    propose_plan: tool({
      description:
        "Draft a schedule from the user's open tasks (scored by due date, priority, age, effort) fitted into " +
        "working hours or a given window. Use for 'plan my day/week', 'what should I do next', 'I have 2 hours free'. " +
        "Returns a draft; nothing changes until accept_plan. To apply edits, call again with pin/exclude.",
      inputSchema: z.object({
        day: z.string().optional().describe("Local date YYYY-MM-DD to plan; default today"),
        days: z.number().int().min(1).max(7).optional().describe("1 for a day plan (default), 7 for a week plan"),
        start: isoTime.optional().describe("Start of an explicit free window (replaces working hours)"),
        end: isoTime.optional().describe("End of the explicit free window"),
        availableMinutes: z.number().int().positive().optional().describe("Total minutes the user has"),
        pinTaskIds: z.array(z.string()).optional().describe("Tasks to put first, in this order"),
        excludeTaskIds: z.array(z.string()).optional().describe("Tasks to leave out"),
      }),
      execute: ({ day, days, start, end, availableMinutes, pinTaskIds, excludeTaskIds }) =>
        safe(async () => {
          const windowStart = at(start);
          // "An hour free from 8": the duration is what the user said; an end the model rounded must not shrink it.
          const byDuration =
            windowStart && availableMinutes ? new Date(windowStart.getTime() + availableMinutes * 60_000) : undefined;
          const explicitEnd = at(end);
          const windowEnd =
            explicitEnd && byDuration ? (explicitEnd > byDuration ? explicitEnd : byDuration) : (explicitEnd ?? byDuration);
          const { plan, result } = await proposePlan(
            userId,
            {
              day,
              days,
              windowStart,
              windowEnd,
              availableMinutes,
              pinIds: pinTaskIds,
              excludeIds: excludeTaskIds,
            },
            clock(),
          );
          return planView(plan, result.freeMinutes, timeZone);
        }),
    }),

    get_plan: tool({
      description: "Get the current plan for a day (the locked-in one, else the latest draft), as it is right now.",
      inputSchema: z.object({ day: z.string().optional().describe("Local date YYYY-MM-DD; default today") }),
      execute: ({ day }) =>
        safe(async () => {
          const plan = await getPlanForDay(userId, day ?? localDate(clock(), timeZone));
          return plan ? planView(plan, null, timeZone) : { plan: null };
        }),
    }),

    accept_plan: tool({
      description:
        "Lock in a drafted plan once the user agrees: sets each task's scheduled time. " +
        "Set remindAtBlockStart only if the user asked to be reminded when each block starts.",
      inputSchema: z.object({ planId: z.string(), remindAtBlockStart: z.boolean().optional() }),
      execute: ({ planId, remindAtBlockStart }) =>
        safe(async () => planView(await acceptPlan(userId, planId, { remindAtBlockStart }), null, timeZone)),
    }),

    set_briefing: tool({
      description:
        "Turn the daily morning briefing (today's plan) or evening review (what's done, what's left) on at a " +
        "local time, move it, or turn it off with time: null.",
      inputSchema: z.object({
        kind: z.enum(["morning_briefing", "evening_review"]),
        time: z.string().nullable().describe("Local 24h time HH:MM, e.g. 07:30; null turns it off"),
      }),
      execute: ({ kind, time }) =>
        safe(async () => {
          const reminder = await setBriefing(userId, kind, time, clock());
          return reminder ? r(reminder) : { note: "It was already off" };
        }),
    }),

    undo: tool({
      description: "Undo the user's most recent change(s). Use for 'undo', 'revert that', 'I didn't mean that'.",
      inputSchema: z.object({ steps: z.number().int().positive().max(10).optional().describe("Default 1") }),
      execute: ({ steps }) =>
        safe(async () => {
          const undone = await undoLast(userId, steps ?? 1);
          return undone.length ? { undone } : { undone: [], note: "Nothing to undo" };
        }),
    }),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;
