"use client";

import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoice } from "@/app/use-voice";
import {
  browserSttSupported,
  setVoiceSettings,
  useIsClient,
  useVoiceSettings,
  type SttEngine,
  type TtsEngine,
} from "@/app/voice-settings";

const suggestions = [
  "What's on my plate today?",
  "Add a task to renew my passport by Friday, high priority",
  "Remind me to call mom tomorrow at 7pm",
  "What's overdue?",
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
  undo: "Undid last change",
};

function ToolChip({ part: p }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(p)) return null;
  const name = getToolName(p);
  const failed =
    p.state === "output-error" ||
    (p.state === "output-available" && typeof p.output === "object" && p.output !== null && "error" in p.output);
  const pending = p.state === "input-streaming" || p.state === "input-available";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        failed
          ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {pending ? "…" : failed ? "✕" : "✓"} {toolLabels[name] ?? name}
    </span>
  );
}

function replyText(message: UIMessage): string {
  return message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
}

export function Assistant({ onChange }: { onChange: () => void }) {
  const [input, setInput] = useState("");
  // Replies are spoken only for turns that started by voice; typed turns stay quiet.
  const voiceTurn = useRef(false);
  const speakRef = useRef<(text: string) => void>(() => {});

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    onFinish: ({ message }) => {
      onChange();
      if (voiceTurn.current) speakRef.current(replyText(message));
      voiceTurn.current = false;
    },
  });
  const busy = status === "submitted" || status === "streaming";

  const voice = useVoice({
    onTranscript: (text) => {
      voiceTurn.current = true;
      sendMessage({ text });
    },
  });
  useEffect(() => {
    speakRef.current = voice.speak;
  }, [voice.speak]);

  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, voice.interim]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    voiceTurn.current = false;
    voice.stopSpeaking();
    sendMessage({ text: text.trim() });
    setInput("");
  }

  const startListening = useCallback(() => {
    if (busy) stop(); // barge-in on a reply that's still streaming
    voice.start();
  }, [busy, stop, voice]);

  // Hold Space (outside text fields) to talk.
  useEffect(() => {
    const typing = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName));
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

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="max-h-80 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "space-y-1"}>
            {m.role === "user" ? (
              <p className="max-w-[85%] rounded-2xl bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1">
                  {m.parts.map((p, i) => (isToolUIPart(p) ? <ToolChip key={i} part={p} /> : null))}
                </div>
                {m.parts.map((p, i) =>
                  p.type === "text" && p.text ? (
                    <p key={i} className="max-w-[85%] text-sm">
                      {p.text}
                    </p>
                  ) : null,
                )}
              </>
            )}
          </div>
        ))}

        {(listening || voice.state === "transcribing") && (
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 dark:border-zinc-700">
              {voice.interim || (listening ? "Listening…" : "Transcribing…")}
            </p>
          </div>
        )}
        {status === "submitted" && <p className="text-sm text-zinc-400">Thinking…</p>}
        {voice.error && <p className="text-sm text-red-600 dark:text-red-400">{voice.error}</p>}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Something went wrong.{" "}
            <button onClick={() => regenerate()} className="underline">
              Retry
            </button>
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="flex gap-2 border-t border-zinc-200 p-2 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <MicButton
          listening={listening}
          disabled={voice.state === "transcribing"}
          onStart={startListening}
          onStop={voice.stop}
          onCancel={voice.cancel}
        />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Voxi… or hold Space to talk"
          aria-label="Message Voxi"
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {voice.state === "speaking" ? (
          <button type="button" onClick={voice.stopSpeaking} className="rounded-md px-3 text-sm text-zinc-500">
            Mute
          </button>
        ) : busy ? (
          <button type="button" onClick={() => stop()} className="rounded-md px-3 text-sm text-zinc-500">
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Send
          </button>
        )}
      </form>
      <VoiceSettingsBar />
    </section>
  );
}

// Press and hold to talk; release sends, dragging off the button cancels.
function MicButton({
  listening,
  disabled,
  onStart,
  onStop,
  onCancel,
}: {
  listening: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={listening ? "Release to send" : "Hold to talk"}
      aria-pressed={listening}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onStop}
      onPointerCancel={onCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex size-9 shrink-0 touch-none select-none items-center justify-center rounded-full transition ${
        listening
          ? "scale-110 bg-red-600 text-white shadow-lg shadow-red-600/30"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      } disabled:opacity-40`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}

function VoiceSettingsBar() {
  const settings = useVoiceSettings();
  const isClient = useIsClient();
  const browserStt = isClient && browserSttSupported();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800">
      <label className="flex items-center gap-1">
        Hearing
        <select
          value={settings.stt}
          onChange={(e) => setVoiceSettings({ stt: e.target.value as SttEngine })}
          className="bg-transparent text-zinc-700 dark:text-zinc-300"
        >
          {browserStt && <option value="browser">Browser (free)</option>}
          <option value="openai">OpenAI (more accurate)</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        Voice
        <select
          value={settings.tts}
          onChange={(e) => setVoiceSettings({ tts: e.target.value as TtsEngine })}
          className="bg-transparent text-zinc-700 dark:text-zinc-300"
        >
          <option value="browser">Browser (free)</option>
          <option value="openai">OpenAI (natural)</option>
          <option value="off">Off</option>
        </select>
      </label>
      <span className="ml-auto hidden sm:inline">Hold Space to talk · Esc to cancel</span>
    </div>
  );
}
