import { handle } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { completeTask } from "@/lib/tasks/repo";

export async function POST(_req: Request, ctx: RouteContext<"/api/tasks/[id]/complete">) {
  const { id } = await ctx.params;
  return handle(async () => completeTask(await getCurrentUserId(), id));
}
