# Schaaq Scanner — Delivery Status

Current version: **v0.2.2**

---

## Phase 1: Ship It Signed

### Completed

| Item | Commit | Notes |
|------|--------|-------|
| Electron main process with Express server | `5a711b3` | In-process server, ESM resolve hook, secure preload |
| electron-builder.yml (Windows + macOS) | `5a711b3` | NSIS installer, asar disabled for native modules |
| GitHub Actions CI/CD | `5a711b3` | `build-release.yml` — builds on push to `master` |
| Release script | `5a711b3` | `scripts/release.sh` — bump, tag, push |
| Icon generation | `52dc29b` | `scripts/generate-icons.mjs` — PNG → ICO/ICNS |
| Auto-updater via GitHub Releases | `5a711b3` | electron-updater, configurable update URL |
| Sentry crash reporting | `5a711b3` | Placeholder DSN, guards for dev mode |
| electron-log file logging | `5a711b3` | Structured logs to `%APPDATA%/logs/` |
| System tray with context menu | `5a711b3` | Show/hide, quit, version display |
| macOS entitlements | `5a711b3` | Hardened runtime for future notarization |
| CI fixes (signing optional, Linux) | `34f40ad`, `08b9125` | Signing skipped when no cert, Linux build fixed |

### Manual Steps Remaining (Uzy)

- [ ] Buy Certum code signing certificate (~$85/yr)
- [ ] Create Sentry account → get DSN → add to `.env`
- [ ] Add GitHub Actions secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`, `GH_TOKEN`, `SENTRY_DSN`
- [ ] (Future) Apple Developer account for macOS notarization
- [ ] Generate real app icons from the Schaaq logo
- [ ] First tagged release: `./scripts/release.sh minor`

---

## Phase 2: First-Run Experience & Polish

### Completed

| Item | Spec § | Commit | Description |
|------|--------|--------|-------------|
| Branded splash screen | §2 | `2db70ae` | Dark splash with logo, version, pulsing animation. Shows during server startup (~2-5s), closes on `did-finish-load`. |
| Application menu | §3.2 | `035db8b` | File, Edit, View, Window, Help menus. Keyboard shortcuts (Ctrl+N, Ctrl+Shift+S). |
| About dialog | §3.3 | `035db8b` | Help → About shows version, Electron/Chrome/Node versions, copyright. |
| Dynamic version display | §3.1 | `d6c78d3` | Window title shows `Schaaq Scanner v0.2.2`. Sidebar shows `Scanner v0.2.2`. `/api/version` endpoint. IPC bridge `app:getVersion`. |
| Welcome wizard | §2 | `7002065` | Two-step full-screen wizard on first launch. Auto-creates demo project (Mining, $50M revenue). Runs dry-run scan. Navigates to results on completion. |
| What's New modal | §2 | `feb7afe` | Shown after version update (not first launch). Compares `localStorage` version. Hardcoded highlights for v0.2.x. Dismiss persists. |
| Skeleton loaders | §3.1 | `78063e7` | `DashboardSkeleton`, `ProjectsSkeleton`, `ScanDetailSkeleton` — animated pulse placeholders matching each page layout. |
| Error states | §3.1 | `78063e7` | `ErrorState` component — warning icon, human-readable message, Try Again + Go to Dashboard. Replaces all `alert()` and raw "Scan not found." text. |

### Verification Results (2 March 2026)

| Test | Result |
|------|--------|
| `npm run build:full` | ✅ Clean (server + UI + Electron) |
| Splash screen on launch | ✅ Appears immediately, closes after server starts |
| Window title | ✅ "Schaaq Scanner v0.2.2" |
| Sidebar version | ✅ "Scanner v0.2.2" |
| Welcome wizard (fresh DB) | ✅ Appears, demo scan completes, navigates to results |
| Demo scan results | ✅ 16 findings, $4.9M cost, 4 critical, 5 major, 7 minor |
| Dashboard after wizard | ✅ 1 project, 1 scan, metric cards, recent scans list |
| Properties page | ✅ Radar chart, 7 property cards with scores |
| Report page | ✅ HTML/CSV export, severity breakdown |
| Projects page | ✅ Demo project card with sector badge, scan buttons |
| What's New modal | ✅ Appears on version mismatch, dismisses, doesn't reappear |
| Error state (bad scan ID) | ✅ Warning icon, "Scan not found", Try Again + Dashboard link |
| Skeleton loaders | ✅ Animated placeholders during page loads |
| Help → About | ✅ Version info dialog |
| Ctrl+N shortcut | ✅ Navigates to New Project |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `electron/main.ts` | Electron main process — splash, server, menu, tray, updater, IPC |
| `electron/preload.ts` | Secure bridge: `getVersion`, `checkForUpdates`, `navigate` |
| `electron/splash.html` | Self-contained splash screen HTML |
| `ui/src/components/WelcomeWizard.tsx` | First-run onboarding wizard |
| `ui/src/components/WhatsNew.tsx` | Post-update release highlights modal |
| `ui/src/components/LoadingSkeleton.tsx` | Animated skeleton placeholders |
| `ui/src/components/ErrorState.tsx` | Friendly error display with retry |
| `ui/src/types/schaaq.d.ts` | TypeScript declarations for Electron bridge |
