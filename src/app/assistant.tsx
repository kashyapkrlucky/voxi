"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  AlertCircle,
  ArrowUp,
  BellRing,
  Check,
  ListTodo,
  Loader2,
  type LucideIcon,
  PlusCircle,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Square,
  SquarePen,
  Sun,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVoice } from "@/app/use-voice";
import { OrbMark, VoiceOrb, type OrbState } from "@/app/voice-orb";
import {
  browserSttSupported,
  setVoiceSettings,
  useIsClient,
  useVoiceSettings,
  type SttEngine,
  type TtsEngine,
} from "@/app/voice-settings";

const suggestions: { text: string; icon: LucideIcon }[] = [
  { text: "Plan my day", icon: Sun },
  { text: "Add a task to renew my passport by Friday, high priority", icon: PlusCircle },
  { text: "Remind me to call mom tomorrow at 7pm", icon: BellRing },
  { text: "What's overdue?", icon: AlertCircle },
];

const toolLabels: Record<string, string> = {
  find_tasks: "Looked up tasks",
  create_task: "Created task",
  update_task: "Updated task",
  complete_task: "Completed task",
  delete_task: "Deleted task",
  list_reminders: "Looked up reminders",
  create_reminder: "Set reminder",
  update_reminder: "Updated reminder",
  cancel_reminder: "Cancelled reminder",
  snooze_reminder: "Snoozed reminder",
  propose_plan: "Drafted plan",
  get_plan: "Checked plan",
  accept_plan: "Locked in plan",
  set_briefing: "Updated briefing",
  get_settings: "Checked settings",
  update_settings: "Updated settings",
  undo: "Undid last change",
};

function ToolChip({ part: p }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(p)) return null;
  const name = getToolName(p);
  const failed =
    p.state === "output-error" ||
    (p.state === "output-available" && typeof p.output === "object" && p.output !== null && "error" in p.output);
  const pending = p.state === "input-streaming" || p.state === "input-available";
  const Icon = pending ? Loader2 : failed ? X : Check;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        failed ? "border-danger/30 bg-danger/10 text-danger" : "border-line bg-panel-2 text-muted"
      }`}
    >
      <Icon className={`size-3 ${pending ? "animate-spin" : failed ? "" : "text-success"}`} strokeWidth={2.5} />
      {toolLabels[name] ?? name}
    </span>
  );
}

// The server-side conversation this page is talking to (there's one chat panel per page).
let currentChatId: string | null = null;
const setCurrentChatId = (id: string) => {
  currentChatId = id;
};

function replyText(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Assistant({ onChange, onOpenTasks }: { onChange: () => void; onOpenTasks: () => void }) {
  const [input, setInput] = useState("");
  // Replies are spoken only for turns that started by voice; typed turns stay quiet.
  const voiceTurn = useRef(false);
  const speakRef = useRef<(text: string) => void>(() => {});

  // The conversation lives on the server; we send only the new message and the chat id.
  const [loaded, setLoaded] = useState(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({ body: { id: currentChatId, message: messages.at(-1) } }),
      }),
    [],
  );

  const { messages, setMessages, sendMessage, status, error, stop, regenerate } = useChat({
    transport,
    onFinish: ({ message }) => {
      onChange();
      if (voiceTurn.current) speakRef.current(replyText(message));
      voiceTurn.current = false;
    },
  });
  const streaming = status === "submitted" || status === "streaming";
  const busy = streaming || !loaded;

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((saved: { id: string; messages: UIMessage[] }) => {
        setCurrentChatId(saved.id);
        setMessages(saved.messages);
      })
      .finally(() => setLoaded(true));
  }, [setMessages]);

  const voice = useVoice({
    onTranscript: (text) => {
      voiceTurn.current = true;
      sendMessage({ text });
    },
  });
  useEffect(() => {
    speakRef.current = voice.speak;
  }, [voice.speak]);

  async function newChat() {
    stop();
    voice.stopSpeaking();
    const res = await fetch("/api/chat/new", { method: "POST" });
    if (!res.ok) return;
    setCurrentChatId((await res.json()).id);
    setMessages([]);
  }

  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, voice.interim, status]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    voiceTurn.current = false;
    voice.stopSpeaking();
    sendMessage({ text: text.trim() });
    setInput("");
  }

  const startListening = useCallback(() => {
    if (streaming) stop(); // barge-in on a reply that's still streaming
    voice.start();
  }, [streaming, stop, voice]);

  // Hold Space (outside text fields) to talk.
  useEffect(() => {
    const typing = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typing(e.target)) return;
      e.preventDefault();
      startListening();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target)) return;
      e.preventDefault();
      voice.stop();
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && (voice.cancel(), voice.stopSpeaking());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("keydown", escape);
    };
  }, [startListening, voice]);

  // A reminder arriving while the app is open is also spoken (the service worker relays pushes here).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "reminder" && e.data.body && voice.state !== "listening") {
        voice.speak(`Reminder: ${e.data.body}`);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [voice]);

  const listening = voice.state === "listening";
  const capturing = listening || voice.state === "transcribing";
  const orbState: OrbState =
    voice.state !== "idle" ? voice.state : status === "submitted" || status === "streaming" ? "thinking" : "idle";
  const empty = loaded && messages.length === 0;
  const orbProps = {
    state: orbState,
    level: voice.level,
    disabled: voice.state === "transcribing" || !loaded,
    onStart: startListening,
    onStop: voice.stop,
    onCancel: voice.cancel,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] sm:px-6">
        <div className="flex items-center gap-2.5">
          <OrbMark className="size-7" />
          <span className="text-[17px] font-semibold tracking-tight">Voxi</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {messages.length > 0 && (
            <IconButton label="New chat" onClick={newChat}>
              <SquarePen className="size-[18px]" />
            </IconButton>
          )}
          <IconButton label="Today's tasks" onClick={onOpenTasks} className="lg:hidden">
            <ListTodo className="size-[18px]" />
          </IconButton>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-panel-3 hover:text-fg"
          >
            <Settings className="size-[18px]" />
          </Link>
        </div>
      </header>

      {/* Conversation */}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col">
          {!loaded ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-faint" />
            </div>
          ) : empty ? (
            <Hero
              orb={<VoiceOrb {...orbProps} size="lg" />}
              capturing={capturing}
              interim={voice.interim}
              onPick={send}
            />
          ) : (
            <div className="flex flex-1 flex-col justify-end gap-6 py-6">
              {messages.map((m) =>
                m.role === "user" ? <UserBubble key={m.id} message={m} /> : <AssistantTurn key={m.id} message={m} />,
              )}
              {status === "submitted" && <Thinking />}
              {error && (
                <div className="animate-rise flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                  <AlertCircle className="size-4 shrink-0" />
                  Something went wrong.
                  <button
                    onClick={() => regenerate()}
                    className="ml-auto inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                  >
                    <RotateCcw className="size-3.5" /> Retry
                  </button>
                </div>
              )}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {/* Live transcript while talking (in conversation view; the hero shows its own) */}
      {!empty && capturing && (
        <div className="animate-fade pointer-events-none px-6 pb-2 text-center">
          <p className="mx-auto max-w-2xl text-balance text-xl font-medium leading-snug tracking-tight sm:text-2xl">
            {voice.interim ? (
              <span className="text-fg">{voice.interim}</span>
            ) : (
              <span className="text-faint">{listening ? "Listening…" : "Transcribing…"}</span>
            )}
          </p>
        </div>
      )}

      {/* Dock */}
      <div className="px-4 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)_-_0.5rem))] pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          {voice.error && (
            <p className="animate-rise mb-2 flex items-center gap-2 text-sm text-danger">
              <AlertCircle className="size-4" /> {voice.error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <form
              className="glass shadow-soft flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line py-1.5 pl-5 pr-1.5 transition focus-within:border-line-strong"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={empty ? "Or type it…" : "Message Voxi…"}
                aria-label="Message Voxi"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-faint"
              />
              {voice.state === "speaking" ? (
                <DockAction label="Mute Voxi" onClick={voice.stopSpeaking}>
                  <VolumeX className="size-4" />
                </DockAction>
              ) : streaming ? (
                <DockAction label="Stop" onClick={() => stop()}>
                  <Square className="size-3.5 fill-current" />
                </DockAction>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!input.trim() || busy}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fg text-canvas transition hover:opacity-90 disabled:bg-panel-3 disabled:text-faint"
                >
                  <ArrowUp className="size-4" strokeWidth={2.5} />
                </button>
              )}
            </form>
            {!empty && <VoiceOrb {...orbProps} />}
          </div>
          <div className="mt-1.5 flex items-center justify-between px-2 text-[11px] text-faint">
            <VoiceMenu />
            <span className="hidden sm:inline">
              Hold <Kbd>Space</Kbd> to talk · <Kbd>Esc</Kbd> to cancel
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Greeting() {
  // Time-of-day depends on the viewer's clock: render it in the browser only.
  const isClient = useIsClient();
  return <p className="h-5 text-sm font-medium text-muted">{isClient ? greeting() : ""}</p>;
}

function Hero({
  orb,
  capturing,
  interim,
  onPick,
}: {
  orb: React.ReactNode;
  capturing: boolean;
  interim: string;
  onPick: (text: string) => void;
}) {
  return (
    <div className="animate-rise flex flex-1 flex-col items-center justify-center gap-8 py-10 text-center">
      <div className="space-y-2">
        <Greeting />
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          What should we <span className="text-gradient">get done</span>?
        </h1>
      </div>
      <div className="py-6">{orb}</div>
      <p className="min-h-8 max-w-xl text-balance text-xl font-medium tracking-tight">
        {capturing ? (
          interim ? (
            <span>{interim}</span>
          ) : (
            <span className="text-faint">Listening…</span>
          )
        ) : (
          <span className="text-base font-normal text-muted">Tap or hold the orb and just say it.</span>
        )}
      </p>
      <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {suggestions.map(({ text, icon: Icon }) => (
          <button
            key={text}
            onClick={() => onPick(text)}
            className="glass group flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left text-sm text-muted transition hover:-translate-y-0.5 hover:border-line-strong hover:text-fg"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-panel-3 text-accent transition group-hover:bg-accent group-hover:text-white">
              <Icon className="size-4" />
            </span>
            <span className="line-clamp-2">{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: UIMessage }) {
  return (
    <div className="animate-rise flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-accent to-[color-mix(in_oklab,var(--accent),var(--accent-2)_45%)] px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-[0_8px_24px_-12px_var(--accent)]">
        {replyText(message)}
      </p>
    </div>
  );
}

function AssistantTurn({ message }: { message: UIMessage }) {
  const tools = message.parts.filter(isToolUIPart);
  const text = message.parts.filter((p) => p.type === "text" && p.text);
  return (
    <div className="animate-rise flex gap-3">
      <OrbMark className="mt-0.5 size-7" />
      <div className="min-w-0 flex-1 space-y-2">
        {tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((p, i) => (
              <ToolChip key={i} part={p} />
            ))}
          </div>
        )}
        {text.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">
            {p.type === "text" ? p.text : null}
          </p>
        ))}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="animate-rise flex items-center gap-3" aria-label="Voxi is thinking">
      <OrbMark className="size-7" />
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-muted [animation:dot-pulse_1.2s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-panel-3 hover:text-fg ${className}`}
    >
      {children}
    </button>
  );
}

function DockAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-panel-3 text-fg transition hover:bg-line-strong"
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-panel-2 px-1 py-px font-mono text-[10px] text-muted">{children}</kbd>
  );
}

// Per-device speech engines, tucked into a small popover.
function VoiceMenu() {
  const settings = useVoiceSettings();
  const isClient = useIsClient();
  const browserStt = isClient && browserSttSupported();
  const select =
    "w-full rounded-lg border border-line bg-panel-solid px-2 py-1.5 text-xs text-fg outline-none focus:border-line-strong";

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full px-2 py-1 transition hover:bg-panel-3 hover:text-muted [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-3.5" />
        Voice
      </summary>
      <div className="glass shadow-soft absolute bottom-full left-0 z-20 mb-2 w-64 space-y-3 rounded-2xl border border-line p-3 text-xs text-muted">
        <label className="block space-y-1">
          <span className="font-medium text-fg">Hearing you</span>
          <select
            value={settings.stt}
            onChange={(e) => setVoiceSettings({ stt: e.target.value as SttEngine })}
            className={select}
          >
            {browserStt && <option value="browser">Browser · free, instant</option>}
            <option value="openai">OpenAI · most accurate</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-fg">Voxi&apos;s voice</span>
          <select
            value={settings.tts}
            onChange={(e) => setVoiceSettings({ tts: e.target.value as TtsEngine })}
            className={select}
          >
            <option value="browser">Browser · free</option>
            <option value="openai">OpenAI · natural</option>
            <option value="off">Off · text only</option>
          </select>
        </label>
        <p className="text-faint">Saved on this device. Replies are spoken only when you talk.</p>
      </div>
    </details>
  );
}
