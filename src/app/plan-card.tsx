"use client";

import { Lock, RefreshCw, Sparkles } from "lucide-react";
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
const minutes = (b: Block) => Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000);

// Today's plan as a timeline: the accepted one, or the latest draft from Voxi / the morning briefing.
export function PlanCard({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [data, setData] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Highlights the block in progress; ticks each minute.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

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
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
      setVersion((v) => v + 1);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="h-32 animate-pulse rounded-2xl bg-panel-2" />;
  const plan = data.plan;
  const done = new Set(data.doneTaskIds);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel-2">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
          {plan && plan.days > 1 ? "This week" : "Plan"}
        </h3>
        {plan && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              plan.status === "accepted" ? "bg-success/15 text-success" : "bg-warn/15 text-warn"
            }`}
          >
            {plan.status === "accepted" && <Lock className="size-2.5" strokeWidth={3} />}
            {plan.status === "accepted" ? "Locked in" : "Draft"}
          </span>
        )}
        <button
          onClick={() => call("/api/plans", {})}
          disabled={busy}
          aria-label={plan ? "Re-plan" : "Plan my day"}
          title={plan ? "Re-plan" : "Plan my day"}
          className="ml-auto flex size-7 items-center justify-center rounded-full text-faint transition hover:bg-panel-3 hover:text-fg disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <p className="mx-4 mb-2 rounded-lg bg-danger/10 px-2 py-1 text-xs text-danger">{error}</p>}

      {!plan ? (
        <div className="px-4 pb-4">
          <p className="text-sm text-muted">No plan yet for today.</p>
          <button
            onClick={() => call("/api/plans", {})}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent to-accent-2 px-3.5 py-1.5 text-xs font-medium text-white shadow-[0_6px_20px_-8px_var(--accent)] transition hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="size-3.5" /> Plan my day
          </button>
          <p className="mt-2 text-xs text-faint">Or just say “plan my day”.</p>
        </div>
      ) : plan.blocks.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">Nothing fits in the time left today.</p>
      ) : (
        <ol className="relative px-4 pb-3">
          {plan.blocks.map((b, i) => {
            const finished = done.has(b.taskId);
            const current = !finished && new Date(b.start).getTime() <= now && now < new Date(b.end).getTime();
            const last = i === plan.blocks.length - 1;
            return (
              <li key={b.taskId + b.start} className="relative flex gap-3 pb-3 last:pb-1">
                <div className="w-14 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-faint">
                  {plan.days > 1 && <div className="font-medium text-muted">{day(b.start)}</div>}
                  {time(b.start)}
                </div>
                <div className="relative flex flex-col items-center">
                  <span
                    className={`mt-1.5 size-2.5 rounded-full ring-4 ${
                      finished
                        ? "bg-success ring-success/15"
                        : current
                          ? "bg-accent ring-accent/25 [animation:orb-breathe_2s_ease-in-out_infinite]"
                          : "bg-line-strong ring-transparent"
                    }`}
                  />
                  {!last && <span className="mt-1 w-px flex-1 bg-line-strong" />}
                </div>
                <div
                  className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${current ? "bg-accent/10 ring-1 ring-accent/25" : ""}`}
                >
                  <p className={`text-sm leading-snug ${finished ? "text-faint line-through" : "text-fg"}`}>
                    {b.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {minutes(b)} min{b.reason && b.reason !== "open task" ? ` · ${b.reason}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {plan && plan.unscheduled.length > 0 && (
        <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
          Didn&apos;t fit:{" "}
          {plan.unscheduled
            .slice(0, 3)
            .map((u) => u.title)
            .join(", ")}
          {plan.unscheduled.length > 3 && ` +${plan.unscheduled.length - 3} more`}
        </p>
      )}

      {plan?.status === "proposed" && plan.blocks.length > 0 && (
        <div className="border-t border-line p-2">
          <button
            onClick={() => call(`/api/plans/${plan.id}/accept`, {})}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-fg px-3 py-2 text-xs font-medium text-canvas transition hover:opacity-90 disabled:opacity-50"
          >
            <Lock className="size-3.5" /> Lock it in
          </button>
        </div>
      )}
    </section>
  );
}
