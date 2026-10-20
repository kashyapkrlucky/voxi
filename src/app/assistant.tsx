"use client";

import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

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

export function Assistant({ onChange }: { onChange: () => void }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    onFinish: () => onChange(),
  });
  const bottom = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text: text.trim() });
    setInput("");
  }

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

        {status === "submitted" && <p className="text-sm text-zinc-400">Thinking…</p>}
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
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Voxi… e.g. move the dentist task to Thursday"
          aria-label="Message Voxi"
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {busy ? (
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
    </section>
  );
}
