import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { OrbMark } from "@/app/voice-orb";

const errors: Record<string, string> = {
  AccessDenied: "That Google account isn't allowed to use this Voxi.",
  Configuration: "Sign-in isn't configured correctly on the server.",
};

// Reads the session per request, so it renders on the server instead of from a prerendered shell.
export const instant = false;

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/") ? params.callbackUrl : "/";
  if (await auth()) redirect(callbackUrl);

  const error = typeof params.error === "string" ? (errors[params.error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="glass shadow-soft animate-rise w-full max-w-sm rounded-3xl border border-line p-8 text-center">
        <div className="relative mx-auto mb-8 size-24">
          <span
            aria-hidden
            className="absolute -inset-6 rounded-full opacity-70 blur-2xl"
            style={{ background: "radial-gradient(closest-side, #5b8cff, #6ee7f9 60%, transparent)" }}
          />
          <OrbMark className="relative size-24" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Voxi</h1>
        <p className="mt-2 text-sm text-muted">Your voice-first assistant for tasks, reminders and plans.</p>

        {error && <p className="mt-6 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-line-strong bg-panel-solid px-4 py-3 text-sm font-medium text-fg shadow-sm transition hover:-translate-y-px hover:shadow-md"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"
              />
              <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" />
              <path
                fill="#EA4335"
                d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
              />
            </svg>
            Continue with Google
          </button>
        </form>
        <p className="mt-6 text-xs text-faint">Private to you. Only allowed Google accounts can sign in.</p>
      </div>
    </main>
  );
}
