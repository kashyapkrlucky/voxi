import { handle } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { acknowledgeReminder } from "@/lib/reminders/repo";

// "Done" button on a reminder notification.
export async function POST(_req: Request, ctx: RouteContext<"/api/reminders/[id]/done">) {
  const { id } = await ctx.params;
  return handle(async () => acknowledgeReminder(await getCurrentUserId(), id));
}
