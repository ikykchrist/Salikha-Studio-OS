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
export function formatManilaDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!value) return "—";
  const dateOnly = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return "—";
  const date = new Date(`${dateOnly}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { ...options, timeZone: MANILA_TIME_ZONE }).format(date);
}
