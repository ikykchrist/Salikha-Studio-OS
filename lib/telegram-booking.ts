export type TelegramBookingDraft = {
  clientName: string;
  phone: string;
  eventName: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  packageName: string;
  total: number | null;
  statedBalance: number | null;
  celebrant: string;
  theme: string;
  guestCount: string;
  celebrantPhoto: string;
};

const field = (text: string, labels: string[]) => {
  for (const label of labels) {
    const match = text.match(new RegExp(`^\\s*(?:${label})\\s*:\\s*(.+?)\\s*$`, "im"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
};
const amount = (value: string) => {
  if (!value) return null;
  const cleaned = value.replace(/[₱,\s]/g, "");
  return /^\d+(?:\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : null;
};
const dateValue = (value: string) => {
  if (!value) return "";
  const cleaned = value.replace(/\([^)]*\)/g, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const match = cleaned.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (!match) return "";
  const month = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(match[1].toLowerCase()) + 1;
  const iso = `${match[3]}-${String(month).padStart(2,"0")}-${match[2].padStart(2,"0")}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return date.toISOString().slice(0,10) === iso ? iso : "";
};
const clock = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (!match) return "";
  const hour = Number(match[1]);
  if (hour < 1 || hour > 12) return "";
  return `${String((hour % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2,"0")}:${match[2] || "00"}`;
};
const timeRange = (value: string) => {
  const parts = value.split(/\s*(?:to|[-–—])\s*/i);
  return parts.length === 2 ? [clock(parts[0]), clock(parts[1])] : ["", ""];
};

export function parseTelegramBooking(text: string): TelegramBookingDraft {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const packageLine = lines.find(line => /^(?!name|date|time|venue|balance|client|contact|estimated|design|celebrant)[^:]{2,60}:\s*₱?\s*[\d,]+(?:\.\d{1,2})?$/i.test(line)) || "";
  const [startTime,endTime] = timeRange(field(text,["time","event time"]));
  return {
    clientName: field(text,["client name","contact name","booked by","parent name"]),
    phone: field(text,["contact number","phone number","mobile number","phone"]),
    eventName: field(text,["name of the event","event name"]),
    date: dateValue(field(text,["date","event date"])),
    startTime,endTime,
    venue: field(text,["venue address","venue","location"]),
    packageName: packageLine ? packageLine.split(":")[0].trim() : field(text,["package","service"]),
    total: amount(packageLine ? packageLine.split(":").slice(1).join(":") : field(text,["total price","package price","total"])),
    statedBalance: amount(field(text,["balance","remaining balance"])),
    celebrant: field(text,["name of the celebrant","celebrant"]),
    theme: field(text,["design theme","theme"]),
    guestCount: field(text,["estimated guest count","guest count"]),
    celebrantPhoto: field(text,["celebrant photo"]),
  };
}

export function missingTelegramFields(draft: TelegramBookingDraft) {
  const missing: string[] = [];
  if (!draft.clientName) missing.push("client name");
  if (!draft.eventName) missing.push("event name");
  if (draft.total === null) missing.push("package price / total");
  return missing;
}

export function telegramDraftPreview(draft: TelegramBookingDraft) {
  const money = (value: number | null) => value === null ? "TBA" : `₱${value.toLocaleString("en-PH",{minimumFractionDigits:2})}`;
  const implied = draft.total !== null && draft.statedBalance !== null ? draft.total - draft.statedBalance : null;
  return [
    "📋 Booking draft — review before saving",
    `Client: ${draft.clientName || "MISSING — send: client <name>"}`,
    `Event: ${draft.eventName || "MISSING"}`,
    `Package: ${draft.packageName || "Custom service"}`,
    `Price: ${money(draft.total)}`,
    `Date: ${draft.date || "TBA"}`,
    `Time: ${draft.startTime && draft.endTime ? `${draft.startTime}–${draft.endTime}` : "TBA"}`,
    `Venue: ${draft.venue || "TBA"}`,
    draft.guestCount ? `Guests: ${draft.guestCount}` : "",
    draft.celebrant ? `Celebrant: ${draft.celebrant}` : "",
    draft.theme ? `Theme: ${draft.theme}` : "",
    draft.celebrantPhoto ? `Celebrant photo: ${draft.celebrantPhoto}` : "",
    draft.statedBalance !== null ? `Balance stated in message: ${money(draft.statedBalance)}` : "",
    implied !== null && implied >= 0 ? `Implied payment: ${money(implied)} — NOT posted to Cashflow; verify in the app.` : "",
    "No booking is saved until you tap Confirm. Send `client <name>` or `edit <field> <value>` to correct this draft.",
  ].filter(Boolean).join("\n");
}
