import { Home as HomeView } from "@/app/home";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Voxi</h1>
        <p className="text-sm text-zinc-500">Type to Voxi for now. Voice comes in Phase 2.</p>
      </header>
      <HomeView />
    </main>
  );
}
