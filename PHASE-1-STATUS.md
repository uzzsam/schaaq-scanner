# Phase 1: Ship It Signed — Status

## Completed (by Claude)

- Electron main process with Express server integration
- Secure preload script with contextBridge
- electron-builder.yml for Windows + macOS builds
- GitHub Actions CI/CD workflow (build-release.yml)
- One-command release script (scripts/release.sh)
- Icon generation script (scripts/generate-icons.mjs)
- Auto-updater via GitHub Releases
- Sentry crash reporting (placeholder DSN)
- electron-log file logging
- System tray with context menu
- macOS entitlements for notarization

## Manual Steps Remaining (Uzy)

- [ ] Buy Certum code signing certificate ($85/yr)
- [ ] Create Sentry account and get DSN
- [ ] Add GitHub Actions secrets (CSC_LINK, CSC_KEY_PASSWORD, GH_TOKEN, SENTRY_DSN)
- [ ] (Future) Apple Developer account for macOS notarization
- [ ] Generate real app icons from the Schaaq logo
- [ ] First tagged release: `./scripts/release.sh minor`
