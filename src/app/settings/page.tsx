import Link from "next/link";
import { SettingsForm } from "@/app/settings/settings-form";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← Back to Voxi
        </Link>
      </header>
      <SettingsForm />
    </main>
  );
}
