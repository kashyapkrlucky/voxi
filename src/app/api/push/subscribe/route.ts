import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { removePushSubscription, savePushSubscription } from "@/lib/push";

// Shape of PushSubscription.toJSON() from the browser, plus an optional label.
const subscription = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  deviceLabel: z.string().max(100).nullable().optional(),
});

export async function POST(req: Request) {
  const body = await readJson(req);
  return handle(async () => {
    const sub = await savePushSubscription(await getCurrentUserId(), subscription.parse(body));
    return { id: sub.id };
  }, 201);
}

export async function DELETE(req: Request) {
  const body = await readJson(req);
  return handle(async () => {
    const { endpoint } = z.object({ endpoint: z.url() }).parse(body);
    await removePushSubscription(await getCurrentUserId(), endpoint);
    return { ok: true };
  });
}
