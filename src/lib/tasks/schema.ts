import { z } from "zod";
import { isValidRecurrenceRule } from "@/lib/recurrence";

export const priorities = ["low", "medium", "high", "urgent"] as const;
export const taskStatuses = ["todo", "in_progress", "done", "cancelled"] as const;

const optionalDate = z.coerce.date().nullable().optional();
// Accepts real booleans (agent) and "true"/"false" query strings (REST).
const flag = z.union([z.boolean(), z.stringbool()]).optional();

export const recurrenceRule = z
  .string()
  .max(500)
  .refine(isValidRecurrenceRule, "Invalid RRULE, e.g. FREQ=WEEKLY;BYDAY=MO");

export const createTaskInput = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(5000).nullable().optional(),
  priority: z.enum(priorities).optional(),
  dueAt: optionalDate,
  scheduledFor: optionalDate,
  estimateMin: z.number().int().positive().max(24 * 60).nullable().optional(),
  project: z.string().trim().max(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  recurrenceRule: recurrenceRule.nullable().optional(),
  parentId: z.string().nullable().optional(),
});

export const updateTaskInput = createTaskInput.partial().extend({
  status: z.enum(taskStatuses).optional(),
});

export const findTasksInput = z.object({
  query: z.string().trim().optional(),
  status: z.enum(taskStatuses).optional(),
  project: z.string().optional(),
  tag: z.string().optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  overdue: flag,
  includeDone: flag,
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export type CreateTaskInput = z.input<typeof createTaskInput>;
export type UpdateTaskInput = z.input<typeof updateTaskInput>;
export type FindTasksInput = z.input<typeof findTasksInput>;
