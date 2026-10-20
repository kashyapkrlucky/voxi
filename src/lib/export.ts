import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

// Everything Voxi stores for the user, as one JSON document (a backup you control; Neon's free tier
// only keeps a short restore window). Push subscription keys are left out: they're device secrets.
export async function exportUserData(userId: string) {
  const [settings, tasks, reminders, plans, chats] = await Promise.all([
    getSettings(userId),
    prisma.task.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.reminder.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.plan.findMany({ where: { userId, status: { not: "superseded" } }, orderBy: { createdAt: "asc" } }),
    prisma.chat.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);
  const strip = <T extends { userId: string }>(row: T) => {
    const copy: Partial<T> = { ...row };
    delete copy.userId;
    return copy;
  };
  return {
    app: "voxi",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    tasks: tasks.map(strip),
    reminders: reminders.map((r) => strip({ ...r, triggerRunId: undefined })),
    plans: plans.map(strip),
    chats: chats.map(strip),
  };
}
