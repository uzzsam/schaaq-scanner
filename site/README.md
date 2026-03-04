# Schaaq Scanner — Marketing Site

Static site for [scanner.schaaq.com](https://scanner.schaaq.com).

Built with Vite + React + TypeScript. Tailwind CSS via CDN play mode.

## Development

```bash
cd site
npm install
npm run dev
```

Dev server starts on `http://localhost:5174`.

## Build

```bash
npm run build
npm run preview   # preview the production build locally
```

## Deployment

### Vercel (recommended)

1. Connect the repo to Vercel
2. Set **Root Directory** to `site/`
3. **Build Command:** `npm run build`
4. **Output Directory:** `dist`

SPA routing and security headers are configured in `vercel.json`.

### GitHub Pages

1. Update `base` in `vite.config.ts` to `'/schaaq-scanner/'`
2. Run `npm run build`
3. Deploy `dist/` to the `gh-pages` branch

## Content

Markdown content (changelog, legal, security) is fetched at runtime from
the repo's `main` branch via GitHub raw URLs. Update the source files and
the site picks up changes automatically — no redeploy needed.

## Screenshots

See `SCREENSHOTS-NEEDED.md` for the list of screenshots to capture from
the running app. Store them in `public/screenshots/`.
