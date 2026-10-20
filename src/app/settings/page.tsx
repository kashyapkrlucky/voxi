import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SettingsForm } from "@/app/settings/settings-form";

// Reads the session per request, so it renders on the server instead of from a prerendered shell.
export const instant = false;

export default async function SettingsPage() {
  const session = await auth();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← Back to Voxi
        </Link>
      </header>
      <SettingsForm />
      <section className="mt-10 flex items-center justify-between border-t border-zinc-200 pt-6 text-sm dark:border-zinc-800">
        <span className="text-zinc-500">
          {session?.user?.email ? <>Signed in as {session.user.email}</> : "Signed in (local dev bypass)"}
        </span>
        {session && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
