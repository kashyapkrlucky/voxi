import { handle, readJson } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { deleteTask, getTask, updateTask } from "@/lib/tasks/repo";
import { updateTaskInput } from "@/lib/tasks/schema";

export async function GET(_req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => getTask(await getCurrentUserId(), id));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return handle(async () => updateTask(await getCurrentUserId(), id, updateTaskInput.parse(body)));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => deleteTask(await getCurrentUserId(), id));
}
