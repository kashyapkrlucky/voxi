"use client";

import { Briefcase, Download, Globe2, type LucideIcon, Mic, Moon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Settings = {
  timezone: string;
  workStart: string;
  workEnd: string;
  quietStart: string | null;
  quietEnd: string | null;
};

const field =
  "rounded-xl border border-line bg-panel-solid px-3 py-2 text-sm text-fg outline-none transition focus:border-line-strong disabled:opacity-50";

function Section({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint?: string;
  icon: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <section className="glass flex gap-4 rounded-2xl border border-line p-4 sm:p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel-3 text-accent">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function SettingsForm() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Built lazily on the client; the full IANA list isn't needed for the server render.
  const zones = useMemo(
    () => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []),
    [],
  );

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Settings) => {
        setSaved(s);
        setDraft(s);
      })
      .catch(() => setStatus({ kind: "error", text: "Couldn't load settings" }));
  }, []);

  if (!draft || !saved) return <div className="h-64 animate-pulse rounded-2xl bg-panel-2" />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const quietOn = draft.quietStart !== null;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const set = (patch: Partial<Settings>) => {
    setDraft({ ...draft, ...patch });
    setStatus(null);
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.issues?.[0]?.message ?? body.error ?? "Couldn't save");
      setSaved(body);
      setDraft(body);
      setStatus({ kind: "ok", text: "Saved" });
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Section icon={Globe2} title="Timezone" hint="Due dates, reminders and plans use this.">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={draft.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            className={field}
            aria-label="Timezone"
          >
            {(zones.includes(draft.timezone) ? zones : [draft.timezone, ...zones]).map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {deviceZone !== draft.timezone && (
            <button
              onClick={() => set({ timezone: deviceZone })}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-fg"
            >
              Use this device&apos;s ({deviceZone.replaceAll("_", " ")})
            </button>
          )}
        </div>
      </Section>

      <Section icon={Briefcase} title="Working hours" hint="Plans fill tasks into this window.">
        <div className="flex items-center gap-2 text-sm">
          <input
            type="time"
            value={draft.workStart}
            onChange={(e) => set({ workStart: e.target.value })}
            className={field}
            aria-label="Work start"
          />
          <span className="text-muted">to</span>
          <input
            type="time"
            value={draft.workEnd}
            onChange={(e) => set({ workEnd: e.target.value })}
            className={field}
            aria-label="Work end"
          />
        </div>
      </Section>

      <Section icon={Moon} title="Quiet hours" hint="Reminders that come due in this window are held until it ends.">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            className="size-4 accent-[var(--accent)]"
            type="checkbox"
            checked={quietOn}
            onChange={(e) =>
              set(e.target.checked ? { quietStart: "22:00", quietEnd: "07:00" } : { quietStart: null, quietEnd: null })
            }
          />
          Hold reminders overnight
        </label>
        {quietOn && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="time"
              value={draft.quietStart ?? ""}
              onChange={(e) => set({ quietStart: e.target.value })}
              className={field}
              aria-label="Quiet start"
            />
            <span className="text-muted">to</span>
            <input
              type="time"
              value={draft.quietEnd ?? ""}
              onChange={(e) => set({ quietEnd: e.target.value })}
              className={field}
              aria-label="Quiet end"
            />
          </div>
        )}
      </Section>

      <Section
        icon={Mic}
        title="Voice"
        hint="Voxi listens with OpenAI and answers out loud in her own voice whenever you talk to her. Typed messages get a text reply."
      />

      <Section
        icon={Download}
        title="Your data"
        hint="Download everything Voxi stores for you as a JSON file: tasks, reminders, plans and chats."
      >
        <a
          href="/api/export"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-sm text-fg transition hover:border-line-strong hover:bg-panel-3"
        >
          <Download className="size-3.5" /> Export my data
        </a>
      </Section>

      <div className="sticky bottom-4 z-10 flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-full bg-fg px-5 py-2 text-sm font-medium text-canvas shadow-soft transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-success" : "text-danger"}`}>{status.text}</span>
        )}
      </div>
    </div>
  );
}
