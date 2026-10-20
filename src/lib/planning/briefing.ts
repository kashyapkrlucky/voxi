import type { ReminderKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { planBlocks, proposePlan } from "@/lib/planning/repo";
import { addDays, atLocal, localDate, localIso } from "@/lib/time";

// Notification text for the daily briefing reminders, computed when they fire.

const names = (titles: string[], max = 2) =>
  titles.length <= max ? titles.join(" and ") : `${titles.slice(0, max).join(", ")} and ${titles.length - max} more`;

export async function buildBriefing(
  kind: Exclude<ReminderKind, "reminder">,
  userId: string,
  now: Date = new Date(),
): Promise<{ title: string; body: string }> {
  const { timezone } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const today = localDate(now, timezone);
  const dayStart = atLocal(today, 0, timezone);
  const dayEnd = atLocal(addDays(today, 1), 0, timezone);

  if (kind === "morning_briefing") {
    // Drafts today's plan so "lock it in" is one tap/phrase away when the app opens.
    const { plan, result } = await proposePlan(userId, { day: today }, now);
    const blocks = planBlocks(plan);
    const overdue = await prisma.task.count({
      where: { userId, deletedAt: null, status: { in: ["todo", "in_progress"] }, dueAt: { lt: dayStart } },
    });
    if (blocks.length === 0) return { title: "Good morning", body: "Nothing planned today. Enjoy the free time." };
    const first = blocks[0];
    const body = [
      `${blocks.length} task${blocks.length === 1 ? "" : "s"} today, starting with ${first.title} at ${localIso(new Date(first.start), timezone).slice(11)}.`,
      overdue ? `${overdue} overdue.` : "",
      result.unscheduled.length ? `${result.unscheduled.length} won't fit.` : "",
      "Open Voxi to lock in the plan.",
    ]
      .filter(Boolean)
      .join(" ");
    return { title: "Good morning", body };
  }

  const done = await prisma.task.count({ where: { userId, deletedAt: null, completedAt: { gte: dayStart, lt: dayEnd } } });
  const open = await prisma.task.findMany({
    where: { userId, deletedAt: null, status: { in: ["todo", "in_progress"] }, OR: [{ dueAt: { lt: dayEnd } }, { scheduledFor: { gte: dayStart, lt: dayEnd } }] },
    orderBy: { dueAt: "asc" },
    select: { title: true },
  });
  const finished = done === 0 ? "No tasks finished today." : `You finished ${done} task${done === 1 ? "" : "s"} today.`;
  const left = open.length
    ? ` Still open: ${names(open.map((t) => t.title))}. Want to move ${open.length === 1 ? "it" : "them"} to tomorrow?`
    : " Everything due today is done.";
  return { title: "Evening review", body: finished + left };
}
