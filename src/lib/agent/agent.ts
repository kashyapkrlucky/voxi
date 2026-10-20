import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, isStepCount, streamText, type ModelMessage } from "ai";
import { buildInstructions } from "@/lib/agent/instructions";
import { buildTools } from "@/lib/agent/tools";

export type AgentContext = { userId: string; timeZone: string; now?: Date };

function config({ userId, timeZone, now }: AgentContext) {
  return {
    model: openai(process.env.OPENAI_MODEL ?? "gpt-5-mini"),
    instructions: buildInstructions(now ?? new Date(), timeZone),
    tools: buildTools(userId, timeZone, now),
    // A turn is usually find → act → reply; leave room for a clarifying lookup.
    stopWhen: isStepCount(6),
    providerOptions: {
      openai: {
        // Optional tool args need non-strict schemas.
        strictJsonSchema: false,
        // Calls often depend on each other (propose → accept, find → update); run them in order.
        parallelToolCalls: false,
        // Lower effort = faster replies, which matters for voice.
        reasoningEffort: (process.env.OPENAI_REASONING_EFFORT ?? "low") as OpenAILanguageModelResponsesOptions["reasoningEffort"],
        reasoningSummary: null,
        store: false,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  };
}

export function streamAgent(ctx: AgentContext, messages: ModelMessage[]) {
  return streamText({ ...config(ctx), messages });
}

export function runAgent(ctx: AgentContext, messages: ModelMessage[]) {
  return generateText({ ...config(ctx), messages });
}
