import { prisma } from "@/lib/db";

// No auth yet (plan.md Phase 0): every request acts as the single owner.
// When Google sign-in lands, replace this with the session's user.
export type CurrentUser = { id: string; timezone: string };

let owner: CurrentUser | undefined;

export async function getCurrentUser(): Promise<CurrentUser> {
  if (owner) return owner;

  const email = process.env.OWNER_EMAIL ?? "owner@voxi.local";
  const timezone = process.env.OWNER_TIMEZONE ?? "UTC";
  const user = await prisma.user.upsert({
    where: { email },
    // Keep the stored timezone in sync with the env until there's a settings screen.
    update: { timezone },
    create: { email, timezone },
  });

  owner = { id: user.id, timezone: user.timezone };
  return owner;
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
