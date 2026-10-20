import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// Record a state change in the same transaction as the change itself (used for undo later).
export async function logAction(
  tx: Tx,
  entry: { userId: string; tool: string; args: unknown; before?: unknown; after?: unknown },
) {
  await tx.actionLog.create({
    data: {
      userId: entry.userId,
      tool: entry.tool,
      args: toJson(entry.args) ?? {},
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
