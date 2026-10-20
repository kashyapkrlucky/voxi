import type { UIMessage } from "ai";
import type { Chat, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

// The conversation persists so "that task" still works after a reload. One current chat per user.

// Older turns rarely matter for task commands and only cost tokens; keep the stored history bounded.
export const MAX_STORED_MESSAGES = 100;

export function chatMessages(chat: Chat): UIMessage[] {
  return chat.messages as unknown as UIMessage[];
}

export async function getCurrentChat(userId: string): Promise<Chat> {
  return (
    (await prisma.chat.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } })) ??
    (await prisma.chat.create({ data: { userId } }))
  );
}

export async function getChat(userId: string, id: string): Promise<Chat> {
  const chat = await prisma.chat.findFirst({ where: { id, userId } });
  if (!chat) throw new NotFoundError("Chat", id);
  return chat;
}

export async function saveChatMessages(chatId: string, messages: UIMessage[]): Promise<void> {
  await prisma.chat.update({
    where: { id: chatId },
    data: { messages: messages.slice(-MAX_STORED_MESSAGES) as unknown as Prisma.InputJsonValue },
  });
}

export async function startNewChat(userId: string): Promise<Chat> {
  return prisma.chat.create({ data: { userId } });
}
