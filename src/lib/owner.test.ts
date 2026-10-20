import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// next-auth needs a Next request context; stand in for the session lookup.
const session = vi.hoisted(() => ({ current: null as null | { user: { email: string } } }));
vi.mock("@/auth", async () => {
  const actual = await vi.importActual<typeof import("@/auth")>("@/auth");
  return { ...actual, auth: async () => session.current };
});

const { allowedEmails, devBypassEnabled } = await import("@/auth");
const { getCurrentUser } = await import("@/lib/owner");
const { prisma } = await import("@/lib/db");
const { UnauthorizedError } = await import("@/lib/errors");

const email = `owner-${crypto.randomUUID()}@voxi.test`;

afterEach(() => {
  vi.unstubAllEnvs();
  session.current = null;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("auth allow-list", () => {
  it("is open to anyone by default, and AUTH_ALLOWED_EMAILS restricts it (case-insensitively)", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "");
    vi.stubEnv("OWNER_EMAIL", "owner@example.com");
    expect(allowedEmails()).toEqual([]); // empty = anyone; OWNER_EMAIL no longer restricts sign-in
    vi.stubEnv("AUTH_ALLOWED_EMAILS", " Me@Example.com , other@example.com ");
    expect(allowedEmails()).toEqual(["me@example.com", "other@example.com"]);
  });

  it("only honours the dev bypass outside production", () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(devBypassEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(devBypassEnabled()).toBe(false);
  });
});

describe("getCurrentUser", () => {
  it("rejects when signed out", async () => {
    vi.stubEnv("AUTH_DEV_BYPASS", "false");
    await expect(getCurrentUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("maps the signed-in email to a user row, creating it on first sign-in", async () => {
    session.current = { user: { email: email.toUpperCase() } };
    const first = await getCurrentUser();
    const again = await getCurrentUser();
    expect(again.id).toBe(first.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).email).toBe(email);
  });
});
