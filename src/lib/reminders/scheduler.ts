import { runs, tasks } from "@trigger.dev/sdk";
import type { Reminder } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { fireReminderTask } from "@/jobs/reminders";

// Keeps one Trigger.dev delayed run per active reminder (plan.md §8).
// Failures are logged, not thrown: the sweep-reminders cron fires anything that slips through.

const enabled = () => process.env.REMINDER_SCHEDULER !== "off";

async function cancelRun(runId: string) {
  try {
    await runs.cancel(runId);
  } catch {
    // Already ran, already cancelled, or gone — all fine.
  }
}

export async function syncReminderSchedule(reminder: Reminder): Promise<void> {
  if (!enabled()) return;
  try {
    if (reminder.triggerRunId) await cancelRun(reminder.triggerRunId);

    const active = reminder.status === "scheduled" || reminder.status === "snoozed";
    let runId: string | null = null;
    if (active) {
      const handle = await tasks.trigger<typeof fireReminderTask>(
        "fire-reminder",
        { reminderId: reminder.id, source: "scheduled" },
        { delay: reminder.fireAt, tags: [`reminder_${reminder.id}`] },
      );
      runId = handle.id;
    }

    await prisma.reminder.update({ where: { id: reminder.id }, data: { triggerRunId: runId } });
  } catch (err) {
    console.error("reminder scheduling failed", reminder.id, err);
  }
}

export async function syncReminderScheduleById(id: string): Promise<void> {
  if (!enabled()) return;
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (reminder) await syncReminderSchedule(reminder);
}
