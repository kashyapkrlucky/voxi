import Link from "next/link";
import { Home as HomeView } from "@/app/home";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Voxi</h1>
          <p className="text-sm text-zinc-500">Type, or hold the mic (or Space) and talk.</p>
        </div>
        <Link href="/settings" className="mt-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Settings
        </Link>
      </header>
      <HomeView />
    </main>
  );
}
