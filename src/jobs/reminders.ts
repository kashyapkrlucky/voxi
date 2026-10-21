import { idempotencyKeys, logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { findOverdueReminderIds, findUnscheduledReminderIds, fireReminder } from "@/lib/reminders/fire";
import { syncReminderScheduleById } from "@/lib/reminders/scheduler";

// One delayed run per reminder, triggered by lib/reminders/scheduler.ts.
export const fireReminderTask = schemaTask({
  id: "fire-reminder",
  schema: z.object({ reminderId: z.string(), source: z.enum(["scheduled", "sweep"]) }),
  // Dev runs expire after 10 min by default; reminders can be days away.
  ttl: "24h",
  run: async ({ reminderId, source }) => {
    const outcome = await fireReminder(reminderId);
    logger.info("fire-reminder", { reminderId, source, ...outcome });
    return outcome;
  },
});

// Safety net: delivers anything whose time has passed but is still active (lost/failed runs, outages),
// and schedules upcoming reminders that never got a delivery run.
// Hourly because Trigger.dev's free plan allows at most one cron run per hour; on-time delivery
// comes from the per-reminder delayed runs, not from this.
export const sweepRemindersTask = schedules.task({
  id: "sweep-reminders",
  cron: { pattern: "0 * * * *", window: "60m" },
  run: async () => {
    const unscheduled = await findUnscheduledReminderIds();
    for (const id of unscheduled) await syncReminderScheduleById(id);

    const ids = await findOverdueReminderIds();
    if (ids.length === 0) return { triggered: 0, rescheduled: unscheduled.length };

    await fireReminderTask.batchTrigger(
      await Promise.all(
        ids.map(async (reminderId) => ({
          payload: { reminderId, source: "sweep" as const },
          // A reminder that's still overdue on the next sweep was claimed by nobody; allow a retry then.
          options: { idempotencyKey: await idempotencyKeys.create(`sweep-${reminderId}`), idempotencyKeyTTL: "50m" },
        })),
      ),
    );
    logger.info("sweep-reminders", { triggered: ids.length, rescheduled: unscheduled.length });
    return { triggered: ids.length, rescheduled: unscheduled.length };
  },
});
