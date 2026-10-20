import { z } from "zod";
import { handle, readJson, searchParams } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/owner";
import { getPlanForDay, planBlocks, planUnscheduled, proposePlan } from "@/lib/planning/repo";
import { localDate } from "@/lib/time";
import type { Plan } from "@/generated/prisma/client";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

function view(plan: Plan | null) {
  return plan
    ? { id: plan.id, date: plan.date, days: plan.days, status: plan.status, blocks: planBlocks(plan), unscheduled: planUnscheduled(plan) }
    : null;
}

// Today's plan (accepted, else the latest draft), or null.
export async function GET(req: Request) {
  const params = searchParams(req);
  return handle(async () => {
    const user = await getCurrentUser();
    const d = day.parse(params.day) ?? localDate(new Date(), user.timezone);
    const plan = await getPlanForDay(user.id, d);
    // A plan whose tasks were all completed/deleted since is still shown; the client marks done blocks.
    const done = plan
      ? await prisma.task.findMany({
          where: { id: { in: planBlocks(plan).map((b) => b.taskId) }, OR: [{ status: "done" }, { deletedAt: { not: null } }] },
          select: { id: true },
        })
      : [];
    return { plan: view(plan), doneTaskIds: done.map((t) => t.id) };
  });
}

// Draft a new plan for a day.
export async function POST(req: Request) {
  const json = await readJson(req);
  return handle(async () => {
    const body = z.object({ day, days: z.number().int().min(1).max(7).optional() }).parse(json);
    const user = await getCurrentUser();
    const { plan } = await proposePlan(user.id, body);
    return { plan: view(plan), doneTaskIds: [] };
  }, 201);
}
