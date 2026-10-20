"use client";

import { useEffect, useState } from "react";

type Block = { taskId: string; title: string; start: string; end: string; reason: string };
type PlanView = {
  id: string;
  date: string;
  days: number;
  status: "proposed" | "accepted" | "superseded";
  blocks: Block[];
  unscheduled: { taskId: string; title: string; reason: string }[];
};
type Response = { plan: PlanView | null; doneTaskIds: string[] };

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short" });

// Today's plan: the accepted one, or the latest draft from Voxi / the morning briefing.
export function PlanCard({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [data, setData] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plans")
      .then((r) => r.json())
      .then((d: Response) => !cancelled && setData(d))
      .catch(() => !cancelled && setError("Couldn't load the plan"));
    return () => {
      cancelled = true;
    };
  }, [refreshKey, version]);

  async function call(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
      setVersion((v) => v + 1);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const plan = data.plan;
  const done = new Set(data.doneTaskIds);
  const button =
    "rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50 bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900";

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{plan && plan.days > 1 ? "This week" : "Today's plan"}</h2>
        {plan && (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              plan.status === "accepted"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {plan.status === "accepted" ? "Locked in" : "Draft"}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {plan?.status === "proposed" && (
            <button onClick={() => call(`/api/plans/${plan.id}/accept`, {})} disabled={busy} className={button}>
              Lock it in
            </button>
          )}
          <button
            onClick={() => call("/api/plans", {})}
            disabled={busy}
            className="rounded-md px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {plan ? "Re-plan" : "Plan my day"}
          </button>
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {!plan ? (
        <p className="text-sm text-zinc-500">No plan yet. Ask Voxi to &ldquo;plan my day&rdquo; or tap Plan my day.</p>
      ) : plan.blocks.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing fits in the time left today.</p>
      ) : (
        <ol className="space-y-1">
          {plan.blocks.map((b) => (
            <li key={b.taskId + b.start} className="flex items-baseline gap-3 text-sm">
              <span className="w-24 shrink-0 tabular-nums text-zinc-500">
                {plan.days > 1 && `${day(b.start)} `}
                {time(b.start)}
              </span>
              <span className={done.has(b.taskId) ? "text-zinc-400 line-through" : ""}>{b.title}</span>
              <span className="ml-auto hidden text-xs text-zinc-400 sm:inline">{b.reason}</span>
            </li>
          ))}
        </ol>
      )}
      {plan && plan.unscheduled.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          Didn&apos;t fit: {plan.unscheduled.slice(0, 3).map((u) => u.title).join(", ")}
          {plan.unscheduled.length > 3 && ` and ${plan.unscheduled.length - 3} more`}
        </p>
      )}
    </section>
  );
}
