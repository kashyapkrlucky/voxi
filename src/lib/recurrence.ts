import { RRule } from "rrule";

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
// Note: evaluated in UTC; BYDAY/BYHOUR rules near midnight may need the user's timezone later.
export function nextOccurrence(rule: string, from: Date): Date | null {
  return parse(rule, from).after(from, false);
}
