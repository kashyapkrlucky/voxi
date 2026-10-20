"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Assistant } from "@/app/assistant";
import { NotificationsBar } from "@/app/notifications";
import { PlanCard } from "@/app/plan-card";
import { useIsClient } from "@/app/use-is-client";
import { TaskBoard } from "@/app/task-board";

// App shell: the conversation owns the main area; "Today" (plan + tasks) is a sidebar on large screens
// and a slide-in drawer below that. Both refresh whenever the assistant may have changed something.
export function Home() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!drawer) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawer]);

  return (
    <div className="flex h-dvh min-h-0 w-full">
      <main className="flex min-w-0 flex-1 flex-col">
        <Assistant onChange={refresh} onOpenTasks={() => setDrawer(true)} />
      </main>

      <aside className="glass hidden w-[400px] shrink-0 flex-col border-l border-line lg:flex xl:w-[440px]">
        <TodayPanel refreshKey={refreshKey} onChange={refresh} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Today">
          <button
            aria-label="Close"
            className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawer(false)}
          />
          <div className="animate-drawer absolute inset-y-0 right-0 flex w-[min(440px,94vw)] flex-col border-l border-line bg-panel-solid shadow-2xl">
            <TodayPanel refreshKey={refreshKey} onChange={refresh} onClose={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function TodayPanel({
  refreshKey,
  onChange,
  onClose,
}: {
  refreshKey: number;
  onChange: () => void;
  onClose?: () => void;
}) {
  // The date depends on the viewer's clock, so it renders in the browser only (not in the prerender).
  const isClient = useIsClient();
  const today = isClient
    ? new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : "";
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-3 pt-[calc(env(safe-area-inset-top)_+_1rem)]">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Today</h2>
          <p className="h-4 text-xs text-muted">{today}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-panel-3 hover:text-fg"
          >
            <X className="size-[18px]" />
          </button>
        )}
      </div>
      <div className="scroll-quiet min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-6">
        <PlanCard refreshKey={refreshKey} onChange={onChange} />
        <TaskBoard refreshKey={refreshKey} />
      </div>
      <div className="border-t border-line px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <NotificationsBar />
      </div>
    </>
  );
}
