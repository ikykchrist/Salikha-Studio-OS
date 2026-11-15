import test from "node:test";
import assert from "node:assert/strict";
import { parseTelegramBooking, missingTelegramFields, telegramDownpaymentAmount, telegramDraftPreview } from "../lib/telegram-booking.ts";

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
  assert.equal(telegramDownpaymentAmount(draft), 0);
  assert.equal(draft.clientName, "");
  assert.deepEqual(missingTelegramFields(draft), ["client name"]);
});

test("reads an explicit downpayment and keeps numeric payment references out of the package", () => {
  const draft = parseTelegramBooking(`Client Name: Maria Santos
Name of the event: Birthday party
Package: Classic Photobooth
Price: 5,500
Downpayment: ₱500.50
Payment Date: October 2, 2026
Payment Account: GCash
Payment Reference: 123456789
Balance: 5,000`);
  assert.equal(draft.packageName, "Classic Photobooth");
  assert.equal(draft.total, 5500);
  assert.equal(telegramDownpaymentAmount(draft), 500.5);
  assert.equal(draft.paymentDate, "2026-10-02");
  assert.equal(draft.paymentAccount, "GCash");
  assert.equal(draft.paymentReference, "123456789");
  assert.deepEqual(missingTelegramFields(draft), []);
  assert.match(telegramDraftPreview(draft), /Balance after downpayment: ₱4,999\.50/);
});

test("requires complete valid payment details for a positive downpayment", () => {
  const form = "Client Name: Maria Santos\nName of the event: Birthday\nPHOTOMAN: 5,500\n";
  const draft = parseTelegramBooking(form + "Downpayment: 6,000\nPayment Date: 2026-02-30\nPayment Account: \nBalance: 0");
  assert.deepEqual(missingTelegramFields(draft), ["downpayment at or below the booking price", "actual payment date", "receiving account name"]);
  assert.deepEqual(missingTelegramFields(parseTelegramBooking(form + "Downpayment: pending receipt")), ["valid downpayment amount (or 0)"]);
  assert.equal(telegramDownpaymentAmount(parseTelegramBooking(form + "Downpayment:\nBalance: 5,000")), 0);
  assert.deepEqual(missingTelegramFields(parseTelegramBooking(form + "Downpayment: 0")), []);
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
