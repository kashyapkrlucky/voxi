import { handle, readJson, searchParams } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { createReminder, listReminders } from "@/lib/reminders/repo";
import { createReminderInput, listRemindersInput } from "@/lib/reminders/schema";

export async function GET(req: Request) {
  return handle(async () => listReminders(await getCurrentUserId(), listRemindersInput.parse(searchParams(req))));
}

export async function POST(req: Request) {
  const body = await readJson(req);
  return handle(async () => createReminder(await getCurrentUserId(), createReminderInput.parse(body)), 201);
}
