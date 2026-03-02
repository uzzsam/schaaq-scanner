#!/usr/bin/env node
/**
 * generate-icons.mjs — Generate platform-specific icons from the SVG favicon
 *
 * Uses sharp (Node.js native) instead of ImageMagick for cross-platform support.
 *
 * Usage:
 *   node scripts/generate-icons.mjs [source.svg|source.png]
 *   Default source: ui/public/schaaq-favicon.svg
 *
 * Output:
 *   build/icon.png          (512x512, electron-builder default)
 *   build/icon.ico          (multi-resolution Windows icon)
 *   build/icons/NxN.png     (Linux icon sizes: 16-1024)
 *   schaaq.ico              (copy to repo root for NSIS installer)
 */

import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SOURCE = process.argv[2] || resolve(ROOT, 'ui/public/schaaq-favicon.svg');
const BUILD_DIR = resolve(ROOT, 'build');
const ICONS_DIR = resolve(BUILD_DIR, 'icons');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
// Sizes included in the .ico file (Windows supports up to 256x256 in ICO)
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    process.exit(1);
  }

  console.log(`Source: ${SOURCE}`);

  // Ensure output directories
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(ICONS_DIR, { recursive: true });

  // Generate PNGs at all sizes
  const pngBuffers = new Map();

  for (const size of SIZES) {
    const outPath = resolve(ICONS_DIR, `${size}x${size}.png`);
    const buf = await sharp(SOURCE, { density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    writeFileSync(outPath, buf);
    pngBuffers.set(size, buf);
    console.log(`  Generated: build/icons/${size}x${size}.png`);
  }

  // Copy 512x512 as build/icon.png (electron-builder default)
  const icon512Path = resolve(BUILD_DIR, 'icon.png');
  writeFileSync(icon512Path, pngBuffers.get(512));
  console.log(`  Generated: build/icon.png (512x512)`);

  // Generate .ico from multiple sizes
  const icoBuffers = ICO_SIZES.map((s) => pngBuffers.get(s));
  const icoBuf = await pngToIco(icoBuffers);
  const icoPath = resolve(BUILD_DIR, 'icon.ico');
  writeFileSync(icoPath, icoBuf);
  console.log(`  Generated: build/icon.ico`);

  // Also copy to repo root as schaaq.ico (used by NSIS installer config)
  const rootIcoPath = resolve(ROOT, 'schaaq.ico');
  copyFileSync(icoPath, rootIcoPath);
  console.log(`  Updated:   schaaq.ico (repo root)`);

  console.log('');
  console.log('Done! Generated icons for all platforms.');
  console.log('Note: macOS .icns requires iconutil (macOS only).');
  console.log('  On macOS, run: iconutil -c icns build/icon.iconset -o build/icon.icns');
  console.log('  Or the CI workflow will handle it on the macOS runner.');
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
