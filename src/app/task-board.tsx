"use client";

import { useEffect, useState } from "react";
import type { Priority, TaskStatus } from "@/generated/prisma/enums";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  dueAt: string | null;
  project: string | null;
  tags: string[];
};

type Filter = "open" | "today" | "overdue" | "done";

const filters: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Done" },
];

const priorities: Priority[] = ["low", "medium", "high", "urgent"];

const priorityStyle: Record<Priority, string> = {
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  medium: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function filterQuery(filter: Filter): string {
  const params = new URLSearchParams();
  if (filter === "done") params.set("status", "done");
  if (filter === "overdue") params.set("overdue", "true");
  if (filter === "today") {
    const endOfDay = new Date();
    endOfDay.setHours(24, 0, 0, 0);
    params.set("dueBefore", endOfDay.toISOString());
  }
  return params.toString();
}

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function TaskBoard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Task[]>(`/api/tasks?${filterQuery(filter)}`)
      .then((data) => {
        if (cancelled) return;
        setTasks(data);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter, version, refreshKey]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <NewTaskForm onCreate={(input) => run(() => api("/api/tasks", { method: "POST", body: JSON.stringify(input) }))} />

      <nav className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 rounded-md px-3 py-1.5 transition ${
              filter === f.key ? "bg-white font-medium shadow-sm dark:bg-zinc-800" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={() => run(() => api(`/api/tasks/${task.id}/complete`, { method: "POST" }))}
              onReopen={() => run(() => api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "todo" }) }))}
              onUpdate={(patch) => run(() => api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(patch) }))}
              onDelete={() => run(() => api(`/api/tasks/${task.id}`, { method: "DELETE" }))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTaskForm({ onCreate }: { onCreate: (input: { title: string; priority: Priority; dueAt: string | null }) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState("");

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onCreate({ title: title.trim(), priority, dueAt: fromLocalInput(due) });
        setTitle("");
        setDue("");
        setPriority("medium");
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        aria-label="Task title"
        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
      />
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-2 text-sm dark:border-zinc-700 sm:flex-none"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          aria-label="Priority"
          className="rounded-md border border-zinc-300 bg-transparent px-2 py-2 text-sm dark:border-zinc-700"
        >
          {priorities.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
          Add
        </button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  onComplete,
  onReopen,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onComplete: () => void;
  onReopen: () => void;
  onUpdate: (patch: Partial<Pick<Task, "title" | "priority" | "dueAt">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(toLocalInput(task.dueAt));
  const [priority, setPriority] = useState<Priority>(task.priority);

  const done = task.status === "done";
  const overdue = !done && task.dueAt !== null && new Date(task.dueAt) < new Date();

  if (editing) {
    return (
      <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Edit title"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
        />
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Edit due"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="Edit priority"
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
          >
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              onUpdate({ title: title.trim() || task.title, priority, dueAt: fromLocalInput(due) });
              setEditing(false);
            }}
            className="rounded-md bg-zinc-900 px-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save
          </button>
          <button onClick={() => setEditing(false)} className="px-2 text-sm text-zinc-500">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 p-3">
      <input
        type="checkbox"
        checked={done}
        onChange={done ? onReopen : onComplete}
        aria-label={done ? "Reopen task" : "Complete task"}
        className="mt-1 size-4 accent-zinc-900 dark:accent-zinc-100"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? "text-zinc-400 line-through" : ""}`}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-1.5 py-0.5 ${priorityStyle[task.priority]}`}>{task.priority}</span>
          {task.dueAt && <span className={overdue ? "text-red-600 dark:text-red-400" : "text-zinc-500"}>{formatDue(task.dueAt)}</span>}
          {task.project && <span className="text-zinc-500">#{task.project}</span>}
        </div>
      </div>
      <div className="flex gap-1 text-xs text-zinc-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button onClick={() => setEditing(true)} className="rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          Edit
        </button>
        <button onClick={onDelete} className="rounded px-2 py-1 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
          Delete
        </button>
      </div>
    </li>
  );
}
