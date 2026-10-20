"use client";

import { useEffect, useMemo, useState } from "react";

type Settings = {
  timezone: string;
  workStart: string;
  workEnd: string;
  quietStart: string | null;
  quietEnd: string | null;
};

const field =
  "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700 disabled:opacity-50";

function Section({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-zinc-200 pb-6 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
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

  if (!draft || !saved) return <p className="text-sm text-zinc-500">Loading…</p>;

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
    <div className="space-y-6">
      <Section title="Timezone" hint="Due dates, reminders and plans use this.">
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
              className="text-xs text-zinc-500 underline underline-offset-2"
            >
              Use this device&apos;s ({deviceZone.replaceAll("_", " ")})
            </button>
          )}
        </div>
      </Section>

      <Section title="Working hours" hint="Plans fill tasks into this window.">
        <div className="flex items-center gap-2 text-sm">
          <input
            type="time"
            value={draft.workStart}
            onChange={(e) => set({ workStart: e.target.value })}
            className={field}
            aria-label="Work start"
          />
          <span className="text-zinc-500">to</span>
          <input
            type="time"
            value={draft.workEnd}
            onChange={(e) => set({ workEnd: e.target.value })}
            className={field}
            aria-label="Work end"
          />
        </div>
      </Section>

      <Section title="Quiet hours" hint="Reminders that come due in this window are held until it ends.">
        <label className="flex items-center gap-2 text-sm">
          <input
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
            <span className="text-zinc-500">to</span>
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

      <Section title="Voice" hint="Speech engines are chosen per device, in the bar under the chat on the main page." />

      <Section
        title="Your data"
        hint="Download everything Voxi stores for you as a JSON file: tasks, reminders, plans and chats."
      >
        <a
          href="/api/export"
          className="inline-block rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Export my data
        </a>
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status && (
          <span
            className={`text-sm ${status.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
          >
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}
