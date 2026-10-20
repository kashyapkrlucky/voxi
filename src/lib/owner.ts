import { headers } from "next/headers";
import { auth, devBypassEnabled } from "@/auth";
import { prisma } from "@/lib/db";
import { UnauthorizedError } from "@/lib/errors";

// The signed-in user, from the Google session (src/auth.ts). Our users table is keyed by email; the first
// sign-in creates the row. Throws UnauthorizedError when nobody is signed in.
export type CurrentUser = { id: string; timezone: string };

const idsByEmail = new Map<string, string>();

function isTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// A new account starts in the visitor's timezone (Vercel adds it per request); they can change it in settings.
async function initialTimezone(): Promise<string> {
  try {
    const fromRequest = (await headers()).get("x-vercel-ip-timezone");
    if (isTimezone(fromRequest)) return fromRequest;
  } catch {
    // Not in a request (tests, scripts).
  }
  return isTimezone(process.env.OWNER_TIMEZONE) ? process.env.OWNER_TIMEZONE : "UTC";
}

async function userIdFor(email: string): Promise<string> {
  const cached = idsByEmail.get(email);
  if (cached) return cached;
  // The timezone only seeds a new account; after that the settings page owns it.
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.upsert({ where: { email }, update: {}, create: { email, timezone: await initialTimezone() } }));
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
