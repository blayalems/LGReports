# Google Sheets sync — one-time setup

Phase 2 makes a **shared Google Sheets workbook** the source of truth. Every trusted
leader signs in with their own Google account (personal or Workspace — mixed is fine)
and edits the same workbook, which the overseer shares with them as **Editor** through
normal Google Drive sharing. The GitHub Pages site hosts only the public app shell;
**no member data and no credentials ever live in this repository or its deploy**.

## 1. Create the OAuth Client ID (overseer, once)

The app talks to Google's APIs directly from the browser, so it needs a public OAuth
*Client ID* (this is not a secret — every client-side OAuth app ships one).

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project
   (e.g. "Life Group Tracker").
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **APIs & Services → OAuth consent screen** → External → fill in the app name and
   your email. Add the scopes `.../auth/spreadsheets`, `openid`, `email`.
   Add each leader's Google account under **Test users** (staying in "Testing" mode
   is fine for a small trusted team and avoids Google's verification review).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   *Web application*. Under **Authorized JavaScript origins** add:
   - your GitHub Pages origin, e.g. `https://<owner>.github.io`
   - `http://localhost:5173` (local development)
5. Copy the Client ID (`…apps.googleusercontent.com`).

Optionally bake it into the build as a default so leaders don't have to paste it:
create `.env.local` with `VITE_GOOGLE_CLIENT_ID=<client id>` (safe to commit a
`.env.production` with it — it's public — but never commit anything called a secret).

## 2. Create the shared workbook (overseer, once)

In the app: **Settings → Data & sync** → paste the Client ID → **"Create new shared
workbook (copies this device's data)"**. The app creates a spreadsheet in your Drive
with one tab per record type and copies everything you've entered on this device
into it. Then, in Google Drive, **share that spreadsheet with each leader's Google
account as Editor**.

## 3. Each leader links the workbook (once per device)

Each leader opens the app on their device: **Settings → Data & sync** → paste the
same Client ID and the workbook link → **"Link existing workbook"** → sign in with
the Google account the workbook was shared with. Done — from then on the device
loads from and saves to the shared workbook, re-syncing on focus and every minute.

## How sync behaves

- The status chip only ever reports what actually happened: **Saved** means the
  write landed in the workbook; a failed write shows an error, never a false "synced".
- Every row carries a `revision`; if two leaders edit the same row at once, the
  second save is refused ("stale") instead of silently overwriting — refresh and retry.
- Check-ins are an append-only log, so simultaneous check-ins never conflict.
- Writes use the Sheets `RAW` input mode, so text that looks like a formula
  (`=…`, `+…`) is stored as plain text and never executed.
- Edits are attributed to the signed-in Google account in the workbook's `audit`
  tab and `updatedBy` columns — that's the accountability trail for the team.

## What deliberately stays off Google (for now)

- **Photos** remain in each device's browser storage in this phase. The
  privacy-friendly `drive.file` scope can't let one leader read a file another
  leader's app uploaded, and the alternative (full-Drive scope) triggers Google's
  heavyweight verification. A shared media folder is planned as its own phase.
- **Access tokens** live in tab memory only. localStorage holds just the public
  Client ID and the workbook id — never tokens, emails, or member data.

## Troubleshooting

- **Popup closes instantly / "sign-in was cancelled"** — allow popups for the site;
  confirm the account is listed under OAuth consent screen → Test users.
- **"Workbook isn't shared with this account"** — the overseer must share the
  spreadsheet (Editor) with exactly the Google account the leader signs in with.
- **"Workbook columns were changed by hand"** — someone edited the header row or
  deleted a tab in the Sheets UI. Restore the header names (row 1) to match the
  app's schema; row *data* edits in the sheet are fine and sync into the app.
