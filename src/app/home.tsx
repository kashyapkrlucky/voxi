"use client";

import { useState } from "react";
import { Assistant } from "@/app/assistant";
import { NotificationsBar } from "@/app/notifications";
import { PlanCard } from "@/app/plan-card";
import { TaskBoard } from "@/app/task-board";

// Bumps the plan and task list whenever the assistant (or the plan card) may have changed something.
export function Home() {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Assistant onChange={refresh} />
        <NotificationsBar />
      </div>
      <PlanCard refreshKey={refreshKey} onChange={refresh} />
      <TaskBoard refreshKey={refreshKey} />
    </div>
  );
}
