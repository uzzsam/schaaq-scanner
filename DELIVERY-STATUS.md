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

## Phase 3: Branded Report — The Money Maker

**Gold Standard §10 — Professional Reports**

| Item | Status |
|---|---|
| Branded PDF report | Electron printToPDF + server fallback |
| Executive summary page | One-pager with radar, top 3, recommendation |
| Data quality scorecard | SVG radar chart (7 properties) |
| Findings table with severity | Full detail with db-specific remediation |
| 5-year cost projection chart | Dual-bar comparison |
| White-label fields | Consultant/client logos, custom titles |
| Strengths section | "What's Working Well" in report |
| Database context | Engine-specific messaging |

### Verification Results (3 March 2026)

| Test | Result |
|------|--------|
| `npm run build:full` | Clean (server + UI + Electron) |
| `npm test` | 547 passed, 44 skipped (Docker-dependent) |
| Settings page accessible from sidebar | Gear icon at bottom of sidebar |
| Consultant name and tagline entry | Text inputs, save with feedback |
| Logo upload with preview | Drag-drop, PNG/JPEG/SVG, max 500KB |
| HTML report reflects branding | Consultant name, tagline, logos in header/footer |
| PDF download in Electron | printToPDF via IPC, save dialog |
| PDF download in browser | Server-side puppeteer-core, falls back to HTML |
| CSV source report | "CSV/Excel Upload" label, CSV-appropriate remediation |
| Strengths in report | "What's Working Well" section with positive observations |

### Key Files

| File | Purpose |
|------|---------|
| `src/report/generator.ts` | Enhanced Handlebars template with radar, strengths, branding |
| `electron/main.ts` | IPC handler for printToPDF |
| `electron/preload.ts` | Exposed generatePdf channel |
| `src/server/routes/scans.ts` | HTML + PDF export routes with branding pass-through |
| `src/server/routes/settings.ts` | Branding settings API (CRUD + logo upload) |
| `src/server/db/schema.ts` | settings table (v6 migration) |
| `src/server/db/repository.ts` | getSetting, setSetting, getAllSettings |
| `ui/src/pages/BrandingSettings.tsx` | Branding config UI (text + logo uploads) |
| `ui/src/pages/ScanReport.tsx` | Enabled PDF download with fallback |
| `ui/src/api/client.ts` | Settings API client functions |

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

---

## Phase 5: Web Presence

**Gold Standard §7, §9, §12**

| Item | Status |
|---|---|
| Product landing page | Hero, features, 7 properties, personas, sectors, report preview |
| Download page with OS detection | Auto-detect Windows/macOS/Linux, GitHub Releases links, version fetch |
| Getting Started guide | 6-step quickstart with sticky TOC sidebar and scroll-spy |
| Changelog page | Rendered from CHANGELOG.md via GitHub raw URL |
| Legal pages (Privacy, ToS, EULA) | Rendered from repo markdown via GitHub raw URL |
| Security practices page | Rendered from repo markdown via GitHub raw URL |
| 404 page | "Page not found" with back-to-home link |
| Open Graph meta tags | og:title, og:description, og:image, twitter:card |
| Favicon | SVG "Q" logo mark |
| Deployment config | Vercel (vercel.json) + GitHub Pages ready (vite base config) |
| SEO document titles | Every page sets `<title>` via useDocumentTitle hook |
| Screenshot gallery | Screenshots needed (checklist created) |
| Demo video | Script/storyboard needed |

### Verification Results (3 March 2026)

| Test | Result |
|------|--------|
| `cd site && npm run build` | 57 modules, 326KB / 100KB gzip, clean |
| `npx tsc --noEmit` | Zero errors |
| `/` landing page | Hero, $2.4M stat, 3 steps, 7 properties, report mockup, personas, sectors, CTA |
| `/download` | Windows detected, "Recommended" badge, 3 platform cards, GitHub URLs |
| `/docs/start` | 6-step guide, sticky TOC, mobile dropdown, scroll-spy highlights |
| `/changelog` | Fetches from GitHub raw, graceful fallback on 404 |
| `/legal/privacy` | Fetches from GitHub raw, markdown-body styling |
| `/legal/terms` | Fetches from GitHub raw, markdown-body styling |
| `/legal/eula` | Fetches from GitHub raw, markdown-body styling |
| `/security` | Fetches from GitHub raw, markdown-body styling |
| `/nonexistent` | 404 page with "Page not found" and back link |
| Navigation links | Header and footer links all functional |
| Document titles | Each page sets correct `<title>` via hook |
| `npm test` (main app) | 547 passed, 44 skipped (Docker-dependent only) |

### Key Files

| File | Purpose |
|------|---------|
| `site/` | Vite + React marketing site (separate from scanner UI) |
| `site/src/pages/Landing.tsx` | Landing page — 8 sections, scroll-reveal, radar chart SVG |
| `site/src/pages/Download.tsx` | Download page — OS detection, GitHub version fetch |
| `site/src/pages/GettingStarted.tsx` | Getting Started — 6-step guide, sticky TOC, scroll-spy |
| `site/src/components/MarkdownPage.tsx` | Markdown renderer — fetch from GitHub raw, loading skeleton |
| `site/src/components/SiteLayout.tsx` | Header (sticky, nav, CTA) + footer (3-column, legal links) |
| `site/src/components/docs/CodeBlock.tsx` | Code snippet with copy button |
| `site/src/components/docs/Callout.tsx` | Tip/warning/note box |
| `site/src/hooks/useScrollReveal.ts` | IntersectionObserver scroll-reveal with stagger |
| `site/src/hooks/useActiveSection.ts` | Scroll-spy for TOC highlight |
| `site/src/hooks/useDocumentTitle.ts` | Sets document.title per page |
| `site/vercel.json` | SPA rewrites + security headers |
| `site/SCREENSHOTS-NEEDED.md` | Screenshot capture checklist (14 items) |

### Manual Steps (Uzy)

- [ ] Take screenshots from running app (see `site/SCREENSHOTS-NEEDED.md`)
- [ ] Record 60-90 second demo video (Loom or OBS)
- [ ] Deploy site to Vercel or GitHub Pages
- [ ] Point scanner.schaaq.com (or schaaq.com) to the deployment
- [ ] Convert `og-image.svg` to `og-image.png` (1200x630) for social sharing
- [ ] Push legal markdown files to `legal/` directory in repo (privacy-policy.md, terms-of-service.md, eula.md, security-practices.md)
- [ ] Push CHANGELOG.md to repo root
