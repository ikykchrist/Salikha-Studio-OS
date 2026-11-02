# Salikha Studio assistant

The admin-only AI Assistant answers questions with Gemini. It reads a fresh, limited snapshot for each question when **Use current records** is on. This is off by default. The snapshot uses the same `buildFinancialReport` calculation as Reports for the current month, plus upcoming bookings, unpaid balances, and low inventory. It excludes phone numbers, email addresses, internal notes, and source documents. Event names and financial figures in that snapshot are sent to Google's Gemini API. Chat questions are sent to Google in either mode.

## Connect

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). A Gemini consumer subscription is separate from API access and quota.
2. In Salikha, open **AI assistant** as an administrator. Paste the API key and a model ID available to that key, then select **Connect Gemini**. The server verifies the key/model against Google's model endpoint and encrypts the key with the server's existing `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`. The key is never returned to the browser after setup.
3. Alternatively, set `GEMINI_API_KEY` and `GEMINI_MODEL` in the server environment. Environment variables override the saved configuration.

The assistant is read-only. It cannot create bookings, post payments, send messages, or edit inventory. The Telegram bot remains the booking intake workflow with human confirmation. The AI Assistant currently allows 30 questions per administrator per Manila calendar day. Chats are kept in the current browser view only; refreshing or opening a new chat clears them. Every request is authenticated, same-origin, length-limited, and served without caching.

Assistant answers are guidance. Reports and Cashflow are the records of truth. Financial numbers are labeled by report period and may carry reconciliation or closeout warnings. No arbitrary AI-generated SQL or database writes are executed.
