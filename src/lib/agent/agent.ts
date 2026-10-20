import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, isStepCount, streamText, type ModelMessage } from "ai";
import { buildInstructions } from "@/lib/agent/instructions";
import { buildTools } from "@/lib/agent/tools";

export type AgentContext = { userId: string; timeZone: string; now?: Date };

function config({ userId, timeZone, now = new Date() }: AgentContext) {
  return {
    model: openai(process.env.OPENAI_MODEL ?? "gpt-5-mini"),
    instructions: buildInstructions(now, timeZone),
    tools: buildTools(userId, timeZone),
    // A turn is usually find → act → reply; leave room for a clarifying lookup.
    stopWhen: isStepCount(6),
    providerOptions: {
      openai: {
        // Optional tool args need non-strict schemas.
        strictJsonSchema: false,
        reasoningEffort: "low",
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
