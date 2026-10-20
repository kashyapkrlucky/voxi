import { RRule } from "rrule";
import { localIso, parseLocal } from "@/lib/time";

// Accepts "FREQ=WEEKLY;BYDAY=MO" with or without a leading "RRULE:".
function parse(rule: string, dtstart: Date): RRule {
  const body = rule.trim().replace(/^RRULE:/i, "");
  const options = RRule.parseString(body);
  return new RRule({ ...options, dtstart });
}

export function isValidRecurrenceRule(rule: string): boolean {
  try {
    parse(rule, new Date());
    return true;
  } catch {
    return false;
  }
}

// Next occurrence strictly after `from`, anchored at `from`. Null when the rule has ended.
// Evaluated on the user's wall clock ("floating" time), so "daily at 08:00" stays at 08:00 local across DST.
export function nextOccurrence(rule: string, from: Date, timeZone = "UTC"): Date | null {
  const floating = new Date(`${localIso(from, timeZone)}:${String(from.getUTCSeconds()).padStart(2, "0")}Z`);
  const next = parse(rule, floating).after(floating, false);
  return next ? parseLocal(next.toISOString().slice(0, 19), timeZone) : null;
}
