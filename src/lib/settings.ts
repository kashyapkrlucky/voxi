import { z } from "zod";
import type { User } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { setBriefing } from "@/lib/reminders/repo";
import { localIso } from "@/lib/time";

// Per-user settings. Times are "HH:MM" in the API and minutes-after-midnight in the database.

const hhmm = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use 24h HH:MM, e.g. 09:00")
  .transform((v) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  });

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Unknown timezone, use an IANA name like Europe/Berlin");

export const updateSettingsInput = z
  .object({
    timezone: timezone.optional(),
    workStart: hhmm.optional(),
    workEnd: hhmm.optional(),
    quietStart: hhmm.nullable().optional(),
    quietEnd: hhmm.nullable().optional(),
  })
  .strict();

export type UpdateSettingsInput = z.input<typeof updateSettingsInput>;

const toHHMM = (min: number | null) =>
  min === null ? null : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function settingsView(user: User) {
  return {
    timezone: user.timezone,
    workStart: toHHMM(user.workStartMin)!,
    workEnd: toHHMM(user.workEndMin)!,
    quietStart: toHHMM(user.quietStartMin),
    quietEnd: toHHMM(user.quietEndMin),
  };
}

export async function getSettings(userId: string) {
  return settingsView(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
}

export async function updateSettings(userId: string, input: UpdateSettingsInput) {
  const patch = updateSettingsInput.parse(input);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const workStartMin = patch.workStart ?? before.workStartMin;
  const workEndMin = patch.workEnd ?? before.workEndMin;
  if (workEndMin <= workStartMin) throw new RangeError("Working hours must end after they start");

  // Quiet hours are both set or both off; setting only one end reuses the other's current value.
  let quietStartMin = patch.quietStart === undefined ? before.quietStartMin : patch.quietStart;
  let quietEndMin = patch.quietEnd === undefined ? before.quietEndMin : patch.quietEnd;
  if (patch.quietStart === null || patch.quietEnd === null) quietStartMin = quietEndMin = null;
  if ((quietStartMin === null) !== (quietEndMin === null)) throw new RangeError("Set both quiet hours start and end");
  if (quietStartMin !== null && quietStartMin === quietEndMin)
    throw new RangeError("Quiet hours can't start and end at the same time");

  const user = await prisma.user.update({
    where: { id: userId },
    data: { timezone: patch.timezone ?? before.timezone, workStartMin, workEndMin, quietStartMin, quietEndMin },
  });

  // Moving timezones: keep daily briefings at the same local time they had.
  if (patch.timezone && patch.timezone !== before.timezone) {
    const briefings = await prisma.reminder.findMany({
      where: { userId, kind: { not: "reminder" }, status: { in: ["scheduled", "snoozed"] } },
    });
    for (const b of briefings) {
      await setBriefing(
        userId,
        b.kind as "morning_briefing" | "evening_review",
        localIso(b.fireAt, before.timezone).slice(11),
      );
    }
  }
  return settingsView(user);
}

// If `minutesNow` (local) falls in quiet hours, the minute they end; otherwise null. Handles 22:00–07:00 wrap.
export function quietUntil(user: Pick<User, "quietStartMin" | "quietEndMin">, minutesNow: number): number | null {
  const { quietStartMin: start, quietEndMin: end } = user;
  if (start === null || end === null) return null;
  const inside = start < end ? minutesNow >= start && minutesNow < end : minutesNow >= start || minutesNow < end;
  return inside ? end : null;
}
