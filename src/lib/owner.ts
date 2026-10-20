import { auth, devBypassEnabled } from "@/auth";
import { prisma } from "@/lib/db";
import { UnauthorizedError } from "@/lib/errors";

// The signed-in user, from the Google session (src/auth.ts). Our users table is keyed by email; the first
// sign-in creates the row. Throws UnauthorizedError when nobody is signed in.
export type CurrentUser = { id: string; timezone: string };

const idsByEmail = new Map<string, string>();

async function userIdFor(email: string): Promise<string> {
  const cached = idsByEmail.get(email);
  if (cached) return cached;
  // OWNER_TIMEZONE only seeds a new account; after that the settings page owns it.
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, timezone: process.env.OWNER_TIMEZONE ?? "UTC" },
  });
  idsByEmail.set(email, user.id);
  return user.id;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await auth();
  const email =
    session?.user?.email?.toLowerCase() ?? (devBypassEnabled() ? (process.env.OWNER_EMAIL ?? "").toLowerCase() : "");
  if (!email) throw new UnauthorizedError();

  // Read fresh each time so settings changes apply immediately.
  const id = await userIdFor(email);
  return prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, timezone: true } });
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
