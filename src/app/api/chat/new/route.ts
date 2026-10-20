import { handle } from "@/lib/api";
import { startNewChat } from "@/lib/chat";
import { getCurrentUserId } from "@/lib/owner";

// "New chat": later turns go to a fresh conversation; the old one stays stored.
export async function POST() {
  return handle(async () => {
    const chat = await startNewChat(await getCurrentUserId());
    return { id: chat.id, messages: [] };
  }, 201);
}
