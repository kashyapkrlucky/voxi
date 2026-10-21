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

// The VAPID public key baked into this build (stripped of pasted quotes, like the server does).
function appKey(): Uint8Array<ArrayBuffer> {
  return urlBase64ToUint8Array((process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim().replace(/^["']|["']$/g, ""));
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

async function saveSubscription(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sub.toJSON(), deviceLabel: deviceLabel() }),
  });
  if (!res.ok) throw new Error("Couldn't save the subscription");
}

// A subscription made with an older VAPID key can't receive our pushes (the push service answers 403), so
// replace it: forget the old endpoint on the server, then subscribe again with the current key.
async function subscribeWithCurrentKey(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const key = appKey();
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing;
  if (existing) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: existing.endpoint }),
    }).catch(() => {});
    await existing.unsubscribe();
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

async function currentState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub || Notification.permission !== "granted") return "off";
  // Re-sync on every load: fixes key changes and makes sure the server still has this device.
  await saveSubscription(await subscribeWithCurrentKey(reg));
  return "on";
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
      await saveSubscription(await subscribeWithCurrentKey(reg));
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
          <button onClick={disable} disabled={busy} className={pill}>
            Off
          </button>
        )}
      </div>
    </div>
  );
}
