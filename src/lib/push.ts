import webpush from "web-push";
import { prisma } from "@/lib/db";

export type PushPayload = {
  title: string;
  body: string;
  // Lets the service worker offer Done / Snooze and replace older notifications for the same reminder.
  reminderId?: string;
  taskId?: string | null;
  tag?: string;
};

// Dashboard values are often pasted with their .env quotes or stray whitespace; push services then reject
// the signature (Apple answers 403 BadJwtToken), so normalise them.
const clean = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "").trim() || undefined;

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = clean(process.env.VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set");
  const subject = clean(process.env.VAPID_SUBJECT);
  const validSubject = subject && /^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/.test(subject);
  if (!validSubject) console.warn("VAPID_SUBJECT should be mailto:you@example.com or an https URL; using a default");
  webpush.setVapidDetails(validSubject ? subject : "mailto:owner@voxi.local", publicKey, privateKey);
  configured = true;
}

// Sends to every device the user enabled; drops subscriptions the push service says are gone.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  configure();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: "high" },
        );
        sent++;
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          removed++;
        } else {
          // 401/403 mean the push service rejected our VAPID signature: the device subscribed with a different
          // public key than the one we sign with, or the subject is invalid. The body says which (e.g. BadJwtToken).
          const body = String((err as { body?: unknown }).body ?? "").slice(0, 300);
          console.error("push failed", { status, service: new URL(sub.endpoint).host, device: sub.deviceLabel, body });
        }
      }
    }),
  );

  return { sent, removed };
}

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string }; deviceLabel?: string | null },
) {
  // Endpoints are unique per browser install; re-subscribing just refreshes the keys.
  return prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, deviceLabel: sub.deviceLabel ?? null },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, deviceLabel: sub.deviceLabel ?? null },
  });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}
