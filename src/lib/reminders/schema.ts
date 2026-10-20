import { z } from "zod";
import { recurrenceRule } from "@/lib/tasks/schema";

export const reminderStatuses = ["scheduled", "fired", "snoozed", "cancelled"] as const;
export const reminderChannels = ["push", "tts"] as const;

export const createReminderInput = z.object({
  message: z.string().trim().min(1).max(500),
  fireAt: z.coerce.date(),
  recurrenceRule: recurrenceRule.nullable().optional(),
  taskId: z.string().nullable().optional(),
  channels: z.array(z.enum(reminderChannels)).min(1).optional(),
});

export const updateReminderInput = createReminderInput.partial();

export const listRemindersInput = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(reminderStatuses).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderInput>;
export type UpdateReminderInput = z.infer<typeof updateReminderInput>;
export type ListRemindersInput = z.infer<typeof listRemindersInput>;
