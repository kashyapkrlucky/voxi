import { describe, expect, it } from "vitest";
import { buildPlan, type PlanTask } from "@/lib/planning/planner";

const TZ = "Europe/Berlin";
// Tue 20 Oct 2026, 08:00 Berlin (CEST): before working hours.
const NOW = new Date("2026-10-20T06:00:00Z");
const base = { now: NOW, timeZone: TZ, startDay: "2026-10-20", days: 1, workStartMin: 9 * 60, workEndMin: 18 * 60 };

let n = 0;
function task(t: Partial<PlanTask> & { title: string }): PlanTask {
  return { id: `t${++n}`, priority: "medium", dueAt: null, estimateMin: null, createdAt: NOW, ...t };
}
const berlin = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

describe("buildPlan", () => {
  it("puts overdue and urgent work first, starting at the beginning of the workday", () => {
    const tasks = [
      task({ title: "Read book", priority: "low" }),
      task({ title: "Submit report", dueAt: new Date("2026-10-19T16:00:00Z") }),
      task({ title: "Fix prod bug", priority: "urgent", estimateMin: 60 }),
      task({ title: "Pay bill", dueAt: new Date("2026-10-20T21:59:00Z") }),
    ];
    const { blocks } = buildPlan({ ...base, tasks });
    expect(blocks.map((b) => b.title)).toEqual(["Submit report", "Fix prod bug", "Pay bill", "Read book"]);
    expect(blocks.map((b) => berlin(b.start))).toEqual(["09:00", "09:35", "10:40", "11:15"]);
    expect(blocks[0].reason).toBe("overdue");
    expect(blocks[2].reason).toBe("due today");
  });

  it("starts from now (rounded up) when the workday has begun, and stops at the end of the day", () => {
    const now = new Date("2026-10-20T15:07:00Z"); // 17:07 Berlin
    const tasks = [task({ title: "Quick email", estimateMin: 15 }), task({ title: "Deep work", estimateMin: 120 })];
    const { blocks, unscheduled, freeMinutes } = buildPlan({ ...base, now, tasks });
    expect(blocks.map((b) => [b.title, berlin(b.start)])).toEqual([["Quick email", "17:10"]]);
    expect(unscheduled).toEqual([{ taskId: tasks[1].id, title: "Deep work", reason: "no time left" }]);
    expect(freeMinutes).toBe(30);
  });

  it("fits a full free hour starting now (no time lost to rounding)", () => {
    const now = new Date("2026-10-20T18:06:38Z"); // 20:06 Berlin
    const tasks = [
      task({ title: "Call bank", priority: "urgent", estimateMin: 30 }),
      task({ title: "Tidy desk", estimateMin: 20 }),
    ];
    const { blocks } = buildPlan({
      ...base,
      now,
      tasks,
      windowStart: new Date("2026-10-20T18:06:00Z"),
      windowEnd: new Date("2026-10-20T19:06:00Z"),
      availableMinutes: 60,
    });
    expect(blocks.map((b) => [b.title, berlin(b.start)])).toEqual([
      ["Call bank", "20:10"],
      ["Tidy desk", "20:45"],
    ]);
  });

  it("respects an explicit window and a time budget", () => {
    const tasks = [
      task({ title: "A", estimateMin: 45 }),
      task({ title: "B", estimateMin: 45 }),
      task({ title: "C", estimateMin: 45 }),
    ];
    const { blocks, unscheduled } = buildPlan({
      ...base,
      tasks,
      windowStart: new Date("2026-10-20T17:00:00Z"), // 19:00
      windowEnd: new Date("2026-10-20T22:00:00Z"),
      availableMinutes: 90,
    });
    expect(blocks.map((b) => [b.title, berlin(b.start)])).toEqual([
      ["A", "19:00"],
      ["B", "19:50"],
    ]);
    expect(unscheduled.map((u) => u.title)).toEqual(["C"]);
  });

  it("honours pins and exclusions from the user's edits", () => {
    const tasks = [task({ title: "Gym" }), task({ title: "Report", priority: "high" }), task({ title: "Groceries" })];
    const { blocks } = buildPlan({ ...base, tasks, pinIds: [tasks[2].id], excludeIds: [tasks[0].id] });
    expect(blocks.map((b) => b.title)).toEqual(["Groceries", "Report"]);
  });

  it("spreads a week plan, keeping tasks on or before their due day", () => {
    const tasks = [
      task({ title: "Big project", estimateMin: 9 * 60 }), // fills a whole day
      task({ title: "Due Thursday", dueAt: new Date("2026-10-22T15:00:00Z"), estimateMin: 60 }),
      task({ title: "Due Monday", dueAt: new Date("2026-10-26T15:00:00Z"), estimateMin: 60 }),
    ];
    const { blocks } = buildPlan({ ...base, tasks, days: 7 });
    const byTitle = Object.fromEntries(
      blocks.map((b) => [b.title, b.start.toLocaleDateString("sv-SE", { timeZone: TZ })]),
    );
    expect(byTitle["Due Thursday"] <= "2026-10-22").toBe(true);
    expect(byTitle["Due Monday"] <= "2026-10-26").toBe(true);
    expect(byTitle["Big project"]).toBeDefined();
  });

  it("handles DST: a workday after the switch still starts at 09:00 local", () => {
    const { blocks } = buildPlan({ ...base, startDay: "2026-10-26", tasks: [task({ title: "Monday thing" })] });
    expect(blocks[0].start.toISOString()).toBe("2026-10-26T08:00:00.000Z"); // 09:00 CET
  });
});
