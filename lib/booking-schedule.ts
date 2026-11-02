import { validDate } from "./workflow-validation";

export function validBookingSchedule(date: unknown, startTime: unknown, endTime: unknown) {
  const dateValue = date ?? "";
  const startValue = startTime ?? "";
  const endValue = endTime ?? "";
  if (typeof dateValue !== "string" || typeof startValue !== "string" || typeof endValue !== "string") return false;
  if (dateValue && !validDate(dateValue)) return false;
  const validTime = (value: string) => !value || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
  return validTime(startValue) && validTime(endValue) && (!startValue || !endValue || startValue < endValue);
}

export function hasCompleteBookingSchedule(date: unknown, startTime: unknown, endTime: unknown) {
  return validBookingSchedule(date, startTime, endTime) && Boolean(date && startTime && endTime);
}
