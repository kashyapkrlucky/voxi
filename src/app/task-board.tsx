"use client";

import { Check, Clock, Flag, Pencil, Plus, Trash2 } from "lucide-react";
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

type Filter = "today" | "all" | "done";

const filters: { key: Filter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
];

const priorities: Priority[] = ["low", "medium", "high", "urgent"];

const priorityColor: Record<Priority, string> = {
  low: "text-faint",
  medium: "text-accent",
  high: "text-warn",
  urgent: "text-danger",
};

const endOfToday = () => {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
};

function filterQuery(filter: Filter): string {
  const params = new URLSearchParams();
  if (filter === "done") params.set("status", "done");
  if (filter === "today") params.set("dueBefore", endOfToday().toISOString()); // includes overdue
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
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + ` ${time}`;
}

// "All" view groups open tasks by when they're due.
function group(tasks: Task[]): { label: string; tasks: Task[] }[] {
  const now = new Date();
  const eod = endOfToday();
  const buckets = { Overdue: [] as Task[], Today: [] as Task[], Upcoming: [] as Task[], Someday: [] as Task[] };
  for (const t of tasks) {
    if (!t.dueAt) buckets.Someday.push(t);
    else if (new Date(t.dueAt) < now) buckets.Overdue.push(t);
    else if (new Date(t.dueAt) < eod) buckets.Today.push(t);
    else buckets.Upcoming.push(t);
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length)
    .map(([label, list]) => ({ label, tasks: list }));
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
  const [filter, setFilter] = useState<Filter>("today");
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

  const sections = filter === "all" ? group(tasks) : [{ label: "", tasks }];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Tasks</h3>
        <div className="flex rounded-full border border-line bg-panel-2 p-0.5 text-xs">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 transition ${
                filter === f.key ? "bg-panel-solid font-medium text-fg shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <QuickAdd onCreate={(input) => run(() => api("/api/tasks", { method: "POST", body: JSON.stringify(input) }))} />

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-panel-2" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.label || "list"} className="space-y-1">
              {s.label && (
                <p className={`px-1 text-[11px] font-medium ${s.label === "Overdue" ? "text-danger" : "text-faint"}`}>
                  {s.label} · {s.tasks.length}
                </p>
              )}
              <ul className="space-y-1">
                {s.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={() => run(() => api(`/api/tasks/${task.id}/complete`, { method: "POST" }))}
                    onReopen={() =>
                      run(() =>
                        api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "todo" }) }),
                      )
                    }
                    onUpdate={(patch) =>
                      run(() => api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(patch) }))
                    }
                    onDelete={() => run(() => api(`/api/tasks/${task.id}`, { method: "DELETE" }))}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const text =
    filter === "done"
      ? "Nothing finished yet today."
      : filter === "today"
        ? "Nothing due today. Enjoy it, or ask Voxi to plan something."
        : "No open tasks. Say “add a task…” to get started.";
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-faint">{text}</p>;
}

function PrioritySelect({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <label
      className={`relative flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-panel-3 ${priorityColor[value]}`}
    >
      <Flag className="size-3.5" />
      <span className="capitalize">{value}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Priority)}
        aria-label="Priority"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {priorities.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickAdd({
  onCreate,
}: {
  onCreate: (input: { title: string; priority: Priority; dueAt: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState("");
  const expanded = title.length > 0;

  return (
    <form
      className="rounded-xl border border-line bg-panel-2 transition focus-within:border-line-strong focus-within:bg-panel-solid"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onCreate({ title: title.trim(), priority, dueAt: fromLocalInput(due) });
        setTitle("");
        setDue("");
        setPriority("medium");
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Plus className="size-4 shrink-0 text-faint" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task"
          aria-label="Task title"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>
      {expanded && (
        <div className="animate-fade flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5">
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Due"
            className="rounded-lg bg-transparent px-2 py-1 text-xs text-muted outline-none hover:bg-panel-3"
          />
          <PrioritySelect value={priority} onChange={setPriority} />
          <button
            type="submit"
            className="ml-auto rounded-lg bg-fg px-3 py-1 text-xs font-medium text-canvas transition hover:opacity-90"
          >
            Add
          </button>
        </div>
      )}
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
      <li className="animate-fade space-y-2 rounded-xl border border-line-strong bg-panel-solid p-2.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Edit title"
          autoFocus
          className="w-full rounded-lg bg-panel-2 px-2.5 py-1.5 text-sm outline-none"
        />
        <div className="flex flex-wrap items-center gap-1">
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Edit due"
            className="rounded-lg bg-transparent px-2 py-1 text-xs text-muted outline-none hover:bg-panel-3"
          />
          <PrioritySelect value={priority} onChange={setPriority} />
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg px-2.5 py-1 text-xs text-muted hover:bg-panel-3"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onUpdate({ title: title.trim() || task.title, priority, dueAt: fromLocalInput(due) });
                setEditing(false);
              }}
              className="rounded-lg bg-fg px-3 py-1 text-xs font-medium text-canvas"
            >
              Save
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-panel-2">
      <button
        onClick={done ? onReopen : onComplete}
        aria-label={done ? "Reopen task" : "Complete task"}
        className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
          done
            ? "border-success bg-success text-white"
            : "border-line-strong text-success hover:border-success hover:bg-success/10"
        }`}
      >
        <Check
          className={`size-3 transition ${done ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
          strokeWidth={3}
        />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${done ? "text-faint line-through" : "text-fg"}`}>{task.title}</p>
        {(task.dueAt || task.priority === "high" || task.priority === "urgent" || task.project) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {task.dueAt && (
              <span className={`inline-flex items-center gap-1 ${overdue ? "text-danger" : "text-muted"}`}>
                <Clock className="size-3" />
                {formatDue(task.dueAt)}
              </span>
            )}
            {(task.priority === "high" || task.priority === "urgent") && (
              <span className={`inline-flex items-center gap-1 capitalize ${priorityColor[task.priority]}`}>
                <Flag className="size-3" />
                {task.priority}
              </span>
            )}
            {task.project && <span className="text-faint">#{task.project}</span>}
          </div>
        )}
      </div>
      <div className="flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit task"
          className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-panel-3 hover:text-fg"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete task"
          className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
