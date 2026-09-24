# Local Google Calendar connection

The app never sends PostgreSQL credentials or Google refresh tokens to the browser. Google tokens are encrypted at rest in localhost PostgreSQL. The integration requests event-write and calendar-list-read scopes and syncs only bookings with status PENDING; DONE and CANCELLED bookings are removed from the selected calendar.

## One-time Google Cloud setup

1. In Google Cloud Console, create or select a project and enable Google Calendar API.
2. Configure the OAuth consent screen. While the app is in Testing, add the Google account that will connect as a test user.
3. Create an OAuth client with application type Web application.
4. Add this exact authorized redirect URI for the running local server: http://localhost:3001/api/google-calendar/callback
5. Open the app's Settings tab and enter the OAuth client ID and client secret. The callback URI is displayed there; copy that exact URI into Google Cloud's Authorized redirect URIs, then save settings.
6. Connect Google from Settings or Calendar and approve access. Confirm the account and writable calendar appear before using Sync now.

Settings writes the credentials to the ignored local .env.local file, generates its own 32-byte encryption key, and does not return the secret to the browser. Never commit the local file or paste the secret into source code.

If the local server uses a different port, the Settings tab displays the matching callback URI; update Google Cloud's authorized redirect URI to match. Never deploy this local-only setup with localhost OAuth URLs or a development OAuth consent screen.
