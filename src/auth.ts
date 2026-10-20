import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Google sign-in, limited to an allow-list (just the owner for now). Sessions are JWT cookies, so this file
// touches no database and can run in proxy.ts; lib/owner.ts maps the signed-in email to our user row.

export function allowedEmails(): string[] {
  // `||`, not `??`: an empty AUTH_ALLOWED_EMAILS must still fall back to the owner, or nobody can sign in.
  const list = process.env.AUTH_ALLOWED_EMAILS || process.env.OWNER_EMAIL || "";
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Local-only escape hatch for automated testing without a Google account. Never honoured in production.
export function devBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "true";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google], // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from env
  pages: { signIn: "/signin", error: "/signin" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      return Boolean(email && profile?.email_verified && allowedEmails().includes(email));
    },
  },
});
