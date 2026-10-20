import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PlanStateError } from "@/lib/errors";
import { acceptPlan, getPlanForDay, planBlocks, proposePlan } from "@/lib/planning/repo";
import { createTask, getTask } from "@/lib/tasks/repo";
import { createTestUser } from "@/lib/test-utils";
import { undoLast } from "@/lib/undo";

let userId: string;
let cleanup: () => Promise<unknown>;
// Tue 20 Oct 2026, 07:00 Berlin.
const NOW = new Date("2026-10-20T05:00:00Z");

beforeAll(async () => {
  ({ userId, cleanup } = await createTestUser());
  await prisma.user.update({ where: { id: userId }, data: { timezone: "Europe/Berlin" } });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("plans", () => {
  it("proposes, re-proposes, accepts, and undoes", async () => {
    const report = await createTask(userId, { title: "Report", priority: "high", estimateMin: 60 });
    const email = await createTask(userId, { title: "Email Sam", estimateMin: 15 });

    const first = await proposePlan(userId, {}, NOW);
    expect(first.plan.date).toBe("2026-10-20");
    expect(planBlocks(first.plan).map((b) => b.title)).toEqual(["Report", "Email Sam"]);
    expect(planBlocks(first.plan)[0].start).toBe("2026-10-20T07:00:00.000Z"); // 09:00 Berlin

    // An edit ("email first") supersedes the previous draft.
    const second = await proposePlan(userId, { pinIds: [email.id] }, NOW);
    expect(planBlocks(second.plan).map((b) => b.title)).toEqual(["Email Sam", "Report"]);
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: first.plan.id } })).status).toBe("superseded");
    await expect(acceptPlan(userId, first.plan.id)).rejects.toBeInstanceOf(PlanStateError);

    const accepted = await acceptPlan(userId, second.plan.id, { remindAtBlockStart: true });
    expect(accepted.status).toBe("accepted");
    expect((await getTask(userId, email.id)).scheduledFor?.toISOString()).toBe("2026-10-20T07:00:00.000Z");
    expect((await getPlanForDay(userId, "2026-10-20"))?.id).toBe(second.plan.id);

    const undone = await undoLast(userId);
    expect(undone).toEqual([{ tool: "accept_plan", summary: "Un-accepted the plan" }]);
    expect((await getTask(userId, report.id)).scheduledFor).toBeNull();
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: second.plan.id } })).status).toBe("proposed");
  });

  it("plans an evening window with a budget", async () => {
    const { plan, result } = await proposePlan(
      userId,
      { windowStart: new Date("2026-10-20T17:00:00Z"), windowEnd: new Date("2026-10-20T21:00:00Z"), availableMinutes: 60 },
      NOW,
    );
    expect(plan.date).toBe("2026-10-20");
    expect(result.blocks.reduce((m, b) => m + (b.end.getTime() - b.start.getTime()) / 60_000, 0)).toBeLessThanOrEqual(60);
  });
});

describe("isolation between users", () => {
  it("one user can't accept, read or undo another user's plan, or open their chat", async () => {
    const { userId: other, cleanup: done } = await createTestUser();
    await createTask(userId, { title: "Private task", estimateMin: 15 });
    const { plan } = await proposePlan(userId, {}, NOW);

    await expect(acceptPlan(other, plan.id)).rejects.toThrow(/not found/);
    expect(await getPlanForDay(other, plan.date)).toBeNull();
    expect(await undoLast(other)).toEqual([]);

    const { getChat, getCurrentChat } = await import("@/lib/chat");
    const mine = await getCurrentChat(userId);
    await expect(getChat(other, mine.id)).rejects.toThrow(/not found/);
    await done();
  });
});
