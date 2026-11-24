export const calendarServices = ["Photobooth", "Photoman", "Coverage"] as const;
export type CalendarService = typeof calendarServices[number];
export type CalendarBlocks = Record<string, CalendarService[]>;
export type BlockScope = CalendarService | "All";

export const calendarServiceLabels: Record<CalendarService, string> = {
  Photobooth: "Photobooth",
  Photoman: "Photoman",
  Coverage: "Photo & Video",
};
