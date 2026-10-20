import { connection } from "next/server";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { streamAgent } from "@/lib/agent/agent";
import { buildTools } from "@/lib/agent/tools";
import { handle, readJson } from "@/lib/api";
import { chatMessages, getChat, getCurrentChat, saveChatMessages } from "@/lib/chat";
import { getCurrentUser } from "@/lib/owner";

// Agent turns can chain several tool calls.
export const maxDuration = 60;

// Only the recent conversation is sent to the model; older turns rarely matter for task commands.
const MAX_MODEL_MESSAGES = 20;

const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

const body = z.object({
  id: z.string(),
  // The client sends only the new message; history is loaded from the database.
  message: z.object({ id: z.string(), role: z.literal("user"), parts: z.array(z.any()) }).passthrough(),
});

// The current conversation, for the page to show on load.
export async function GET() {
  await connection(); // per-user data: run at request time, never prerender at build
  return handle(async () => {
    const chat = await getCurrentChat((await getCurrentUser()).id);
    return { id: chat.id, messages: chatMessages(chat) };
  });
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  let user, chat;
  try {
    user = await getCurrentUser();
    chat = await getChat(user.id, parsed.data.id);
  } catch (err) {
    // Lets handle() turn "signed out" into 401 and a missing chat into 404.
    return handle(() => Promise.reject(err));
  }

  const message = parsed.data.message as unknown as UIMessage;
  // A retry resends the same user message: replace it (and the failed reply after it) instead of duplicating.
  const stored = chatMessages(chat);
  const existing = stored.findIndex((m) => m.id === message.id);
  const history = existing === -1 ? stored : stored.slice(0, existing);
  // Stored tool parts must still match today's tool schemas; if they don't, start fresh rather than fail.
  const validated = await safeValidateUIMessages({
    messages: [...history, message],
    tools: buildTools(user.id, user.timezone),
  });
  const messages = validated.success ? validated.data : [message];

  const result = streamAgent(
    { userId: user.id, timeZone: user.timezone },
    await convertToModelMessages(messages.slice(-MAX_MODEL_MESSAGES)),
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId,
      onEnd: async ({ messages: all }) => {
        await saveChatMessages(chat.id, all);
      },
    }),
  });
}
