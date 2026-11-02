# Telegram booking intake

Bot: `@SalikhaBookingsBot`

## Connect

1. In Salikha Studio OS, sign in as an admin. Open **Settings → Telegram bot** and paste the token from BotFather into **BotFather token**. Click **Save bot token**. The app verifies that it belongs to `@SalikhaBookingsBot` and stores it encrypted using the existing server-side Google Calendar token encryption key. Never send the token in chat.
2. Click **Activate webhook**. The app registers its HTTPS webhook with Telegram and a secret derived from the bot token.
3. Send `/id` to `@SalikhaBookingsBot`. Copy the numeric user ID into **Approve Telegram user ID** in Settings. Repeat for approved staff. Only approved private chats can create drafts or bookings.
4. Paste the booking form in the bot chat. Include `Client Name: <person booking>` when available. The celebrant is never assumed to be the client.
5. Review the draft. Send `client Maria Santos` or `edit date 2026-10-08`, `edit time 3pm to 5pm`, `edit venue ...`, `edit price 5500`, etc. Tap **Confirm booking** only when accurate. A duplicate or overlapping schedule requires an explicit **Save anyway** tap.

The bot creates or reuses an exact-name client, matches an active package by exact name, saves a Pending booking, and records the Telegram ID and draft ID in the audit log. Unmatched packages are saved as a custom service with the requested name in internal notes. Date or time may remain TBA; Google Calendar sync starts only when the schedule is complete. Changes made later in the Booking editor move the Calendar event.

Balances quoted by a client are displayed in the preview but **no payment or cash entry is posted**. Verify the payment and record it through Cashflow.

The built-in parser handles the studio form. Optional Gemini extraction requires `GEMINI_API_KEY`, `GEMINI_MODEL`, and `TELEGRAM_USE_GEMINI=true` in server environment. This sends pasted client booking text to Google for extraction; it only supplements the draft, and staff still confirm before saving. A consumer Gemini subscription alone does not provide Gemini API access. A `TELEGRAM_BOT_TOKEN` server environment variable is also supported for installations that prefer environment-based token management.

## Example

```text
PHOTOMAN: 5,500
Client Name: Maria Santos
Name of the event: Ryden Ainsley 1st birthday
Date: October 8, 2026 (Thursday)
Time: 3pm to 5pm
Venue Address: Jollibee Puregold Taytay
Estimated Guest Count: 80-100pax
Name of the celebrant: Ryden Ainsley
Design Theme: Jollitown Carnival
Celebrant Photo: No
Balance: 5,000
```

The example's stated ₱5,000 balance implies a ₱500 payment, but the bot does not treat it as received money. Record any real downpayment separately.
