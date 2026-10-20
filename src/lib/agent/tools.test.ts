import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTools } from "@/lib/agent/tools";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/lib/test-utils";

let tools: ReturnType<typeof buildTools>;
let cleanup: () => Promise<unknown>;

// Call a tool's execute directly, the way the model would.
async function call<K extends keyof typeof tools>(name: K, input: Parameters<NonNullable<(typeof tools)[K]["execute"]>>[0]) {
  const exec = tools[name].execute as (input: unknown, options: unknown) => Promise<unknown>;
  return exec(input, { toolCallId: "test", messages: [] }) as Promise<Record<string, unknown> & Record<number, unknown>>;
}

beforeAll(async () => {
  const user = await createTestUser();
  cleanup = user.cleanup;
  tools = buildTools(user.userId, "Europe/Berlin");
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("agent tools", () => {
  it("creates a task from a local time and reports it back in local time", async () => {
    const task = await call("create_task", { title: "Renew passport", dueAt: "2026-10-23T23:59", priority: "high" });
    expect(task).toMatchObject({
      title: "Renew passport",
      priority: "high",
      due: "Fri, 23 Oct 2026, 23:59",
      dueAt: "2026-10-23T23:59",
    });
    expect(task).not.toHaveProperty("userId");
  });

  it("finds, completes, and undoes", async () => {
    const [found] = (await call("find_tasks", { query: "passport" })) as unknown as { id: string }[];
    expect(found).toBeDefined();

    const done = await call("complete_task", { id: found.id });
    expect(done).toMatchObject({ task: { status: "done" }, next: null });

    const undone = await call("undo", {});
    expect(undone).toMatchObject({ undone: [{ tool: "complete_task" }] });
    expect(await call("find_tasks", { query: "passport" })).toHaveLength(1);
  });

  it("returns errors as data instead of throwing", async () => {
    expect(await call("delete_task", { id: "missing" })).toEqual({ error: "Task missing not found" });
    expect(await call("create_reminder", { message: "x", fireAt: "not a date" })).toHaveProperty("error");
  });

  it("creates and snoozes a reminder", async () => {
    const reminder = (await call("create_reminder", { message: "Call mom", fireAt: "2026-10-21T19:00" })) as { id: string };
    expect(reminder).toMatchObject({ fires: "Wed, 21 Oct 2026, 19:00", status: "scheduled" });

    expect(await call("snooze_reminder", { id: reminder.id, minutes: 10 })).toMatchObject({ status: "snoozed" });
    expect(await call("list_reminders", {})).toHaveLength(1);
  });
});
