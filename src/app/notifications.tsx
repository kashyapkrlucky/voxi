"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";

type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${device} · ${browser}`;
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js");
}

async function currentState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export function NotificationsBar() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    currentState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), deviceLabel: deviceLabel() }),
      });
      if (!res.ok) throw new Error("Couldn't save the subscription");
      setState("on");
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setNote(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setNote(res.ok ? `Sent to ${body.sent} device${body.sent === 1 ? "" : "s"}.` : "Test failed.");
  }

  const pill =
    "rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition hover:border-line-strong hover:text-fg disabled:opacity-50";
  const on = state === "on";
  const Icon = on ? BellRing : state === "denied" || state === "unsupported" ? BellOff : Bell;
  const label = {
    loading: "Checking notifications…",
    unsupported: "Notifications aren't supported here. On iPhone, add Voxi to the Home Screen first.",
    denied: "Notifications are blocked. Allow them in your browser's site settings.",
    off: "Reminders won't reach this device.",
    on: "Reminders will notify this device.",
  }[state];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${on ? "bg-success/15 text-success" : "bg-panel-3 text-faint"}`}
        >
          <Icon className="size-3.5" />
        </span>
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted">{note ?? label}</p>
        {state === "off" && (
          <button onClick={enable} disabled={busy} className={pill}>
            Turn on
          </button>
        )}
        {on && (
          <div className="flex gap-1">
            <button onClick={test} disabled={busy} className={pill}>
              Test
            </button>
            <button onClick={disable} disabled={busy} className={pill}>
              Off
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
