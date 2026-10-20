import { handle } from "@/lib/api";
import { getCurrentUserId } from "@/lib/owner";
import { sendPushToUser } from "@/lib/push";

// Sends a test notification to all of the user's devices.
export async function POST() {
  return handle(async () =>
    sendPushToUser(await getCurrentUserId(), { title: "Voxi", body: "Notifications are working.", tag: "voxi-test" }),
  );
}
