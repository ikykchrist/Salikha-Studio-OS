const MANILA_TIME_ZONE = "Asia/Manila";

/** Booking times are PostgreSQL TIME values: local Manila wall-clock times, not UTC instants. */
export function formatManilaTime(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!match) return "—";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "—";
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

/** Date-only booking values must not shift when the app server/browser runs outside Manila. */
export function formatManilaDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!value) return "—";
  // Older invoice snapshots may still contain the ISO timestamp of a Manila date.
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return "—";
  const date = value instanceof Date ? value : new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { ...options, timeZone: MANILA_TIME_ZONE }).format(date);
}
