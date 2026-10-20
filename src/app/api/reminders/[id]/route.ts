import { handle, readJson } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { cancelReminder, updateReminder } from "@/lib/reminders/repo";
import { updateReminderInput } from "@/lib/reminders/schema";

export async function PATCH(req: Request, ctx: RouteContext<"/api/reminders/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle(async () => updateReminder(await getCurrentUserId(), id, updateReminderInput.parse(body)));
}

// Cancels rather than deletes, so the history stays for undo.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reminders/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => cancelReminder(await getCurrentUserId(), id));
}
