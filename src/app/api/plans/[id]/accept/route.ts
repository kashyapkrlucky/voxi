import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { acceptPlan } from "@/lib/planning/repo";

const body = z.object({ remindAtBlockStart: z.boolean().optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/plans/[id]/accept">) {
  const { id } = await ctx.params;
  const json = await readJson(req);
  return handle(async () => {
    const plan = await acceptPlan(await getCurrentUserId(), id, body.parse(json));
    return { id: plan.id, status: plan.status };
  });
}
