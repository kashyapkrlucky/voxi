import { convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from "ai";
import { streamAgent } from "@/lib/agent/agent";
import { getCurrentUser } from "@/lib/owner";

// Agent turns can chain several tool calls.
export const maxDuration = 60;

// Only the recent conversation is sent to the model; older turns rarely matter for task commands.
const MAX_MESSAGES = 20;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const user = await getCurrentUser();

  const result = streamAgent(
    { userId: user.id, timeZone: user.timezone },
    await convertToModelMessages(messages.slice(-MAX_MESSAGES)),
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
