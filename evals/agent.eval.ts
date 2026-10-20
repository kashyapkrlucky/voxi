import type { ModelMessage } from "ai";
import { afterAll, describe, expect, it } from "vitest";
import { runAgent } from "@/lib/agent/agent";
import { prisma } from "@/lib/db";
import { createTask } from "@/lib/tasks/repo";
import { createTestUser } from "@/lib/test-utils";

// Fixed clock: Tuesday 20 Oct 2026, 19:00 in Berlin (CEST, +02:00).
const NOW = new Date("2026-10-20T17:00:00Z");
const TZ = "Europe/Berlin";

const cleanups: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  await Promise.all(cleanups.map((c) => c()));
  await prisma.$disconnect();
});

async function setup() {
  const user = await createTestUser();
  cleanups.push(user.cleanup);
  const messages: ModelMessage[] = [];

  // Sends one user turn and keeps the history for follow-ups.
  async function say(text: string) {
    messages.push({ role: "user", content: text });
    const result = await runAgent({ userId: user.userId, timeZone: TZ, now: NOW }, messages);
    messages.push(...result.response.messages);
    const tools = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    return { text: result.text, tools };
  }

  const tasks = (includeDeleted = false) =>
    prisma.task.findMany({ where: { userId: user.userId, ...(includeDeleted ? {} : { deletedAt: null }) } });
  const reminders = () => prisma.reminder.findMany({ where: { userId: user.userId, status: { not: "cancelled" } } });

  return { userId: user.userId, say, tasks, reminders };
}

// Local calendar date in Berlin, e.g. "2026-10-23".
const berlinDate = (d: Date | null) => (d ? d.toLocaleDateString("sv-SE", { timeZone: TZ }) : null);

describe("agent evals", () => {
  it("creates a task with due day and priority", async () => {
    const { say, tasks } = await setup();
    const { text } = await say("Add a task to renew my passport by Friday, high priority");
    const [task] = await tasks();
    expect(task.title.toLowerCase()).toContain("passport");
    expect(task.title.toLowerCase()).not.toContain("friday");
    expect(task.priority).toBe("high");
    expect(berlinDate(task.dueAt)).toBe("2026-10-23");
    expect(text.length).toBeLessThan(300);
  });

  it("'remind me' creates a reminder at the right time, not a task", async () => {
    const { say, tasks, reminders } = await setup();
    await say("Remind me to call mom tomorrow at 7pm");
    const [r] = await reminders();
    expect(r.message.toLowerCase()).toContain("mom");
    expect(r.fireAt.toISOString()).toBe("2026-10-21T17:00:00.000Z");
    expect(await tasks()).toHaveLength(0);
  });

  it("handles relative reminders", async () => {
    const { say, reminders } = await setup();
    await say("remind me in 20 minutes to check the oven");
    const [r] = await reminders();
    expect(Math.abs(r.fireAt.getTime() - (NOW.getTime() + 20 * 60_000))).toBeLessThanOrEqual(60_000);
  });

  it("creates recurring reminders", async () => {
    const { say, reminders } = await setup();
    await say("Remind me every Monday at 9am to submit my timesheet");
    const [r] = await reminders();
    expect(r.recurrenceRule).toMatch(/FREQ=WEEKLY/);
    expect(r.recurrenceRule).toMatch(/MO/);
    expect(r.fireAt.toISOString()).toBe("2026-10-26T08:00:00.000Z"); // Mon 09:00 CET
  });

  it("asks for a time when a reminder has none", async () => {
    const { say, reminders } = await setup();
    const { text } = await say("Remind me tomorrow to water the plants");
    expect(await reminders()).toHaveLength(0);
    expect(text).toMatch(/\?/);
  });

  it("deletes the right task by fuzzy name", async () => {
    const { userId, say, tasks } = await setup();
    await createTask(userId, { title: "Call dentist" });
    await createTask(userId, { title: "Buy milk" });
    await say("Delete the milk task");
    expect((await tasks()).map((t) => t.title)).toEqual(["Call dentist"]);
  });

  it("moves a task's due date", async () => {
    const { userId, say, tasks } = await setup();
    await createTask(userId, { title: "Call dentist", dueAt: new Date("2026-10-22T10:00:00Z") });
    await say("Move the dentist thing to Friday");
    const [task] = await tasks();
    expect(berlinDate(task.dueAt)).toBe("2026-10-23");
  });

  it("asks instead of guessing when the match is ambiguous", async () => {
    const { userId, say, tasks } = await setup();
    await createTask(userId, { title: "Call dentist" });
    await createTask(userId, { title: "Pay dentist bill" });
    const { text } = await say("Mark the dentist one as done");
    expect((await tasks()).every((t) => t.status === "todo")).toBe(true);
    expect(text).toMatch(/\?/);
  });

  it("answers list questions without changing anything", async () => {
    const { userId, say, tasks } = await setup();
    await createTask(userId, { title: "Submit report", dueAt: new Date("2026-10-19T10:00:00Z") });
    await createTask(userId, { title: "Plan holiday", dueAt: new Date("2026-11-10T10:00:00Z") });
    const { text, tools } = await say("What's overdue?");
    expect(tools).toContain("find_tasks");
    expect(tools.filter((t) => !["find_tasks", "list_reminders"].includes(t))).toEqual([]); // reads only
    expect(text.toLowerCase()).toContain("report");
    expect(text.toLowerCase()).not.toContain("holiday");
    expect((await tasks()).every((t) => t.status === "todo")).toBe(true);
  });

  it("completes a task from casual phrasing", async () => {
    const { userId, say, tasks } = await setup();
    await createTask(userId, { title: "Write quarterly report" });
    await say("I'm done with the report");
    const [task] = await tasks();
    expect(task.status).toBe("done");
  });

  it("resolves 'it' and undo across turns", async () => {
    const { say, tasks } = await setup();
    await say("Add a task: buy milk");
    await say("Actually make it urgent");
    expect((await tasks())[0].priority).toBe("urgent");

    await say("Undo that");
    expect((await tasks())[0].priority).toBe("medium");
  });
});
