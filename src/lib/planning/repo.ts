import type { Plan, Prisma } from "@/generated/prisma/client";
import { logAction } from "@/lib/action-log";
import { prisma } from "@/lib/db";
import { NotFoundError, PlanStateError } from "@/lib/errors";
import { buildPlan, type PlanResult } from "@/lib/planning/planner";
import { syncReminderScheduleById } from "@/lib/reminders/scheduler";
import { localDate } from "@/lib/time";

export type StoredBlock = { taskId: string; title: string; start: string; end: string; reason: string };
export type StoredUnscheduled = { taskId: string; title: string; reason: string };

export type ProposeOptions = {
  day?: string; // local "YYYY-MM-DD"; defaults to today
  days?: number; // 1 = day plan, 7 = week plan
  windowStart?: Date;
  windowEnd?: Date;
  availableMinutes?: number;
  pinIds?: string[];
  excludeIds?: string[];
};

export function planBlocks(plan: Plan): StoredBlock[] {
  return plan.blocks as unknown as StoredBlock[];
}

export function planUnscheduled(plan: Plan): StoredUnscheduled[] {
  return plan.unscheduled as unknown as StoredUnscheduled[];
}

export async function proposePlan(
  userId: string,
  opts: ProposeOptions = {},
  now: Date = new Date(),
): Promise<{ plan: Plan; result: PlanResult }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const day = opts.day ?? localDate(opts.windowStart ?? now, user.timezone);
  const days = Math.min(Math.max(opts.days ?? 1, 1), 14);

  const tasks = await prisma.task.findMany({
    where: { userId, deletedAt: null, status: { in: ["todo", "in_progress"] } },
    select: { id: true, title: true, priority: true, dueAt: true, estimateMin: true, createdAt: true },
  });

  const result = buildPlan({
    tasks,
    now,
    timeZone: user.timezone,
    startDay: day,
    days,
    workStartMin: user.workStartMin,
    workEndMin: user.workEndMin,
    windowStart: opts.windowStart,
    windowEnd: opts.windowEnd,
    availableMinutes: opts.availableMinutes,
    pinIds: opts.pinIds,
    excludeIds: opts.excludeIds,
  });

  const blocks: StoredBlock[] = result.blocks.map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
  const plan = await prisma.$transaction(async (tx) => {
    // Only the latest draft for a day matters.
    await tx.plan.updateMany({ where: { userId, date: day, status: "proposed" }, data: { status: "superseded" } });
    return tx.plan.create({
      data: {
        userId,
        date: day,
        days,
        blocks: blocks as unknown as Prisma.InputJsonValue,
        unscheduled: result.unscheduled as unknown as Prisma.InputJsonValue,
      },
    });
  });
  return { plan, result };
}

// Accepting writes each block's start into task.scheduledFor and can add a reminder at each block start.
export async function acceptPlan(
  userId: string,
  planId: string,
  { remindAtBlockStart = false }: { remindAtBlockStart?: boolean } = {},
): Promise<Plan> {
  const createdReminderIds: string[] = [];
  const plan = await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findFirst({ where: { id: planId, userId } });
    if (!plan) throw new NotFoundError("Plan", planId);
    if (plan.status !== "proposed") {
      throw new PlanStateError(
        plan.status === "superseded"
          ? "This draft was replaced by a newer one; accept the latest planId"
          : "This plan is already locked in",
      );
    }

    const blocks = planBlocks(plan);
    const tasks = await tx.task.findMany({
      where: { userId, id: { in: blocks.map((b) => b.taskId) } },
      select: { id: true, scheduledFor: true },
    });
    const previous = await tx.plan.findMany({ where: { userId, date: plan.date, status: "accepted" }, select: { id: true } });

    for (const b of blocks) {
      await tx.task.update({ where: { id: b.taskId }, data: { scheduledFor: new Date(b.start) } });
      if (remindAtBlockStart && new Date(b.start) > new Date()) {
        const r = await tx.reminder.create({
          data: { userId, taskId: b.taskId, message: `Time for: ${b.title}`, fireAt: new Date(b.start) },
        });
        createdReminderIds.push(r.id);
      }
    }
    await tx.plan.updateMany({ where: { id: { in: previous.map((p) => p.id) } }, data: { status: "superseded" } });
    const accepted = await tx.plan.update({ where: { id: plan.id }, data: { status: "accepted", acceptedAt: new Date() } });

    await logAction(tx, {
      userId,
      tool: "accept_plan",
      args: { planId, remindAtBlockStart },
      before: { id: plan.id, tasks, previousAcceptedIds: previous.map((p) => p.id) },
      after: { id: plan.id, reminderIds: createdReminderIds },
    });
    return accepted;
  });

  for (const id of createdReminderIds) await syncReminderScheduleById(id);
  return plan;
}

// The plan to show for a day: the accepted one if any, else the latest draft.
export async function getPlanForDay(userId: string, day: string): Promise<Plan | null> {
  return (
    (await prisma.plan.findFirst({ where: { userId, date: day, status: "accepted" }, orderBy: { acceptedAt: "desc" } })) ??
    (await prisma.plan.findFirst({ where: { userId, date: day, status: "proposed" }, orderBy: { createdAt: "desc" } }))
  );
}
