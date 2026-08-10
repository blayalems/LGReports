# Life Group Tracker

A responsive life-group reporting system for weekly attendance, member follow-up,
campaign milestones, events, analytics, and report history. It runs entirely in the
browser, stores device-only data in IndexedDB, and can optionally use a shared Google
Sheets workbook as the team source of truth.

## Live site

The GitHub Pages deployment is configured for:

**https://blayalems.github.io/LGReports/**

The app uses hash routes (`#/report`, `#/members`, and so on), so every screen works
on a GitHub Pages project site without server rewrite rules.

## Run locally

Requirements: Node.js 24 and npm.

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
```

The production build is written to `dist/` with the `/LGReports/` asset base.

## Deploy to GitHub Pages

1. In the GitHub repository, open **Settings -> Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push to `main`, or run **Deploy to GitHub Pages** manually from the Actions tab.
4. Wait for the `github-pages` environment deployment to complete.

The workflow in `.github/workflows/deploy-pages.yml` installs locked dependencies,
verifies the app, builds it, uploads `dist/`, and deploys the Pages artifact.

## Data modes

- **This device only:** the default. Records and photos stay in this browser's
  IndexedDB. Settings can export or restore a full `.json` backup; weekly report
  import/export uses `.xlsx` workbooks.
- **Shared Google Sheets:** leaders sign in with their own Google accounts and read
  and write one workbook. Access tokens stay in memory and are never committed or
  persisted by the app.

For shared mode, follow [docs/google-sheets-setup.md](docs/google-sheets-setup.md).
The public OAuth Client ID can be supplied as the repository Actions variable
`VITE_GOOGLE_CLIENT_ID`; users can also paste it in Settings at runtime.

## Main workflows

- Start blank or opt into fictional demo data on first launch.
- Build the group roster and member directory.
- Start a Sunday reporting week and prefill one row per group.
- Check members in, attach a meeting photo, validate, submit, reopen, print, or
  export the weekly report.
- Track campaign goals, weekly VIPs, network growth, and event attendance goals
  and actuals per leader, with calculated network totals.
- Review trends, previous weeks, audit history, birthdays, and follow-up needs.
- Customize church details, theme, accent, stages, statuses, and backups.

No real member or church data is committed to this repository.
