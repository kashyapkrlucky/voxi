import { ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SettingsForm } from "@/app/settings/settings-form";
import { OrbMark } from "@/app/voice-orb";

// Reads the session per request, so it renders on the server instead of from a prerendered shell.
export const instant = false;

export default async function SettingsPage() {
  const session = await auth();
  const email = session?.user?.email;

  return (
    <main className="scroll-quiet h-dvh overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:py-10">
        <header className="mb-8 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to Voxi"
            className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-panel-3 hover:text-fg"
          >
            <ArrowLeft className="size-[18px]" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <OrbMark className="ml-auto size-7" />
        </header>

        <SettingsForm />

        <section className="glass mt-4 flex items-center gap-3 rounded-2xl border border-line p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-semibold uppercase text-white">
            {(email ?? "D")[0]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{email ?? "Local dev bypass"}</p>
            <p className="text-xs text-muted">
              {email ? "Signed in with Google" : "Sign-in is skipped on this machine"}
            </p>
          </div>
          {session && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-line-strong hover:text-fg"
              >
                <LogOut className="size-3.5" /> Sign out
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
