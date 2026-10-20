import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

type Snapshot = Record<string, unknown> & { id: string };

const taskFields = [
  "title", "notes", "status", "priority", "dueAt", "scheduledFor", "estimateMin",
  "project", "tags", "recurrenceRule", "parentId", "completedAt", "deletedAt",
] as const;

const reminderFields = [
  "message", "fireAt", "recurrenceRule", "status", "channels", "taskId", "lastFiredAt",
] as const;

function pick<K extends string>(snapshot: Snapshot, fields: readonly K[]) {
  return Object.fromEntries(fields.map((f) => [f, snapshot[f] ?? null]));
}

export type UndoneAction = { tool: string; summary: string };

// Reverts the most recent `steps` actions, newest first, using the before/after snapshots in action_log.
export async function undoLast(userId: string, steps = 1): Promise<UndoneAction[]> {
  return prisma.$transaction(async (tx) => {
    const entries = await tx.actionLog.findMany({
      where: { userId, undone: false },
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(steps, 1), 20),
    });

    const undone: UndoneAction[] = [];
    for (const entry of entries) {
      const before = entry.before as Snapshot | null;
      const after = entry.after as Snapshot | { task: Snapshot; next: Snapshot | null } | null;
      undone.push(await revert(tx, entry.tool, before, after));
      await tx.actionLog.update({ where: { id: entry.id }, data: { undone: true } });
    }
    return undone;
  });
}

async function revert(
  tx: Prisma.TransactionClient,
  tool: string,
  before: Snapshot | null,
  after: unknown,
): Promise<UndoneAction> {
  switch (tool) {
    case "create_task": {
      const task = after as Snapshot;
      await tx.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
      return { tool, summary: `Removed task "${task.title}"` };
    }
    case "update_task":
    case "delete_task":
    case "complete_task": {
      await tx.task.update({ where: { id: before!.id }, data: pick(before!, taskFields) });
      const next = tool === "complete_task" ? (after as { next: Snapshot | null }).next : null;
      if (next) await tx.task.update({ where: { id: next.id }, data: { deletedAt: new Date() } });
      const verb = { update_task: "Reverted changes to", delete_task: "Restored", complete_task: "Reopened" }[tool];
      return { tool, summary: `${verb} task "${before!.title}"` };
    }
    case "create_reminder": {
      const reminder = after as Snapshot;
      await tx.reminder.update({ where: { id: reminder.id }, data: { status: "cancelled" } });
      return { tool, summary: `Cancelled reminder "${reminder.message}"` };
    }
    case "update_reminder":
    case "cancel_reminder":
    case "snooze_reminder": {
      await tx.reminder.update({ where: { id: before!.id }, data: pick(before!, reminderFields) });
      return { tool, summary: `Restored reminder "${before!.message}"` };
    }
    default:
      throw new Error(`Cannot undo ${tool}`);
  }
}
