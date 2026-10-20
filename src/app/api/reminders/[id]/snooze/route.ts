import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { snoozeReminder } from "@/lib/reminders/repo";

const body = z.object({ minutes: z.number().int().positive().max(24 * 60).default(10) });

export async function POST(req: Request, ctx: RouteContext<"/api/reminders/[id]/snooze">) {
  const { id } = await ctx.params;
  const json = await readJson(req);
  return handle(async () => snoozeReminder(await getCurrentUserId(), id, body.parse(json).minutes));
}
