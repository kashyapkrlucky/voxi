import { prisma } from "@/lib/db";

// No auth yet (plan.md Phase 0): every request acts as the single owner.
// When Google sign-in lands, replace this with the session's user.
export type CurrentUser = { id: string; timezone: string };

let ownerId: string | undefined;

export async function getCurrentUser(): Promise<CurrentUser> {
  if (!ownerId) {
    const email = process.env.OWNER_EMAIL ?? "owner@voxi.local";
    // OWNER_TIMEZONE only seeds a new account; after that the settings page owns it.
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, timezone: process.env.OWNER_TIMEZONE ?? "UTC" },
    });
    ownerId = user.id;
  }
  // Read fresh each time so settings changes apply immediately.
  const { id, timezone } = await prisma.user.findUniqueOrThrow({
    where: { id: ownerId },
    select: { id: true, timezone: true },
  });
  return { id, timezone };
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
