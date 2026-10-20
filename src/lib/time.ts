// Timezone helpers. All instants are stored in UTC; these convert to and from the user's wall clock.

// Human-readable local time so the model can speak it without doing timezone math.
export function formatLocal(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function wallClock(date: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}

// Minutes the zone is ahead of UTC at that instant (DST-aware).
function offsetMinutes(date: Date, timeZone: string): number {
  const p = wallClock(date, timeZone);
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

// ISO 8601 with the zone's offset, e.g. 2026-10-20T19:05:00+02:00.
export function isoInZone(date: Date, timeZone: string): string {
  const p = wallClock(date, timeZone);
  const offsetMin = offsetMinutes(date, timeZone);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

// Wall-clock time in the zone without offset, e.g. 2026-10-20T19:05 (what tools take and return).
export function localIso(date: Date, timeZone: string): string {
  return isoInZone(date, timeZone).slice(0, 16);
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

// Parses a wall-clock time in `timeZone` ("2026-10-26T09:00", or a bare date = midnight).
// Strings that already carry an offset or Z are taken as-is.
export function parseLocal(value: string, timeZone: string): Date {
  const m = LOCAL_DATETIME.exec(value.trim());
  if (!m) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date-time: ${value}`);
    return d;
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // Use the offset at the target instant, not today's, so DST boundaries come out right.
  let guess = asUtc - offsetMinutes(new Date(asUtc), timeZone) * 60_000;
  guess = asUtc - offsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess);
}

// Local calendar date, e.g. "2026-10-21".
export function localDate(date: Date, timeZone: string): string {
  return isoInZone(date, timeZone).slice(0, 10);
}

// Minutes since local midnight.
export function localMinutes(date: Date, timeZone: string): number {
  const [h, m] = isoInZone(date, timeZone).slice(11, 16).split(":").map(Number);
  return h * 60 + m;
}

// The instant for a local date at `minutes` after midnight (DST-aware).
export function atLocal(day: string, minutes: number, timeZone: string): Date {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return parseLocal(`${day}T${h}:${m}`, timeZone);
}

// Calendar arithmetic on "YYYY-MM-DD" strings.
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayName(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}
