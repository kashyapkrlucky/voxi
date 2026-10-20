import { prisma } from "@/lib/db";

// No auth yet (plan.md Phase 0): every request acts as the single owner.
// When Google sign-in lands, replace this with the session's user id.
let ownerId: string | undefined;

export async function getCurrentUserId(): Promise<string> {
  if (ownerId) return ownerId;

  const email = process.env.OWNER_EMAIL ?? "owner@voxi.local";
  const timezone = process.env.OWNER_TIMEZONE ?? "UTC";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, timezone },
  });

  ownerId = user.id;
  return ownerId;
}
