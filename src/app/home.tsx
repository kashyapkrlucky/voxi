"use client";

import { useState } from "react";
import { Assistant } from "@/app/assistant";
import { TaskBoard } from "@/app/task-board";

// Bumps the task list whenever the assistant may have changed something.
export function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-8">
      <Assistant onChange={() => setRefreshKey((k) => k + 1)} />
      <TaskBoard refreshKey={refreshKey} />
    </div>
  );
}
