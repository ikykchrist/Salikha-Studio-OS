import test from "node:test";
import assert from "node:assert/strict";
import { parseTelegramBooking, missingTelegramFields } from "../lib/telegram-booking.ts";

test("parses the studio booking form without inventing a client or payment", () => {
  const draft = parseTelegramBooking(`PHOTOMAN: 5,500
Name of the event: Ryden Ainsley 1st birthday
Date: October 8, 2026 (Thursday)
Time: 3pm to 5pm
Venue Address: Jollibee Puregold Taytay
Estimated Guest Count: 80-100pax
Name of the celebrant: Ryden Ainsley
Design Theme: Jollitown Carnival
Celebrant Photo: No
Balance: 5,000`);
  assert.equal(draft.packageName, "PHOTOMAN");
  assert.equal(draft.total, 5500);
  assert.equal(draft.date, "2026-10-08");
  assert.equal(draft.startTime, "15:00");
  assert.equal(draft.endTime, "17:00");
  assert.equal(draft.statedBalance, 5000);
  assert.equal(draft.clientName, "");
  assert.deepEqual(missingTelegramFields(draft), ["client name"]);
});

test("keeps an unprovided date and time as TBA", () => {
  const draft = parseTelegramBooking("PHOTOMAN: 5,500\nClient Name: Maria Santos\nName of the event: Studio party");
  assert.equal(draft.date, "");
  assert.equal(draft.startTime, "");
  assert.equal(draft.endTime, "");
  assert.deepEqual(missingTelegramFields(draft), []);
});

test("reads the expanded client form fields", () => {
  const draft = parseTelegramBooking(`Client Name: Maria Santos
Phone Number: 09171234567
Email: maria@example.com
Name of the event: Birthday party
Date: (or TBA)
Time: (or TBA)
Package: Classic Photobooth
Price: 5,500
Add-ons: Guestbook, extra hour
Template Number: 12
Backdrop Color: Pastel pink
Other Requests: Include our logo`);
  assert.equal(draft.email, "maria@example.com");
  assert.equal(draft.total, 5500);
  assert.equal(draft.addons, "Guestbook, extra hour");
  assert.equal(draft.templateNumber, "12");
  assert.equal(draft.backdropColor, "Pastel pink");
  assert.equal(draft.otherRequests, "Include our logo");
  assert.equal(draft.date, "");
  assert.deepEqual(missingTelegramFields(draft), []);
});
