#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# generate-icons.sh — Generate platform-specific icons from a source PNG
#
# Requirements:
#   - ImageMagick (convert / magick) — install via:
#       macOS:   brew install imagemagick
#       Ubuntu:  sudo apt install imagemagick
#       Windows: choco install imagemagick / scoop install imagemagick
#   - Source PNG should be at least 1024x1024 for best quality
#
# Usage:
#   ./scripts/generate-icons.sh [source.png]
#   Default source: schaaq-white.png (repo root)
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

die() { echo -e "${RED}ERROR: $*${NC}" >&2; exit 1; }
info() { echo -e "${GREEN}$*${NC}"; }
warn() { echo -e "${YELLOW}$*${NC}"; }

# Find ImageMagick
if command -v magick &>/dev/null; then
  CONVERT="magick"
elif command -v convert &>/dev/null; then
  CONVERT="convert"
else
  die "ImageMagick not found. Install it first:\n  macOS: brew install imagemagick\n  Ubuntu: sudo apt install imagemagick\n  Windows: choco install imagemagick"
fi

SOURCE="${1:-schaaq-white.png}"

if [[ ! -f "$SOURCE" ]]; then
  die "Source image not found: $SOURCE"
fi

info "Source: $SOURCE"
info "Using: $CONVERT"

# ---------------------------------------------------------------------------
# Windows .ico (multi-resolution)
# ---------------------------------------------------------------------------
info "Generating schaaq.ico (Windows)…"
$CONVERT "$SOURCE" \
  -background none \
  \( -clone 0 -resize 16x16 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 256x256 \) \
  -delete 0 \
  schaaq.ico

# ---------------------------------------------------------------------------
# macOS .icns (requires iconutil on macOS, or we generate the iconset)
# ---------------------------------------------------------------------------
ICONSET_DIR="build/icon.iconset"
mkdir -p "$ICONSET_DIR"

info "Generating macOS iconset…"
for SIZE in 16 32 64 128 256 512; do
  $CONVERT "$SOURCE" -resize "${SIZE}x${SIZE}" "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png"
  DOUBLE=$((SIZE * 2))
  $CONVERT "$SOURCE" -resize "${DOUBLE}x${DOUBLE}" "$ICONSET_DIR/icon_${SIZE}x${SIZE}@2x.png"
done

if command -v iconutil &>/dev/null; then
  info "Generating build/icon.icns (macOS native)…"
  iconutil -c icns "$ICONSET_DIR" -o build/icon.icns
  rm -rf "$ICONSET_DIR"
else
  warn "iconutil not available (not on macOS). Iconset saved to ${ICONSET_DIR}/"
  warn "Run 'iconutil -c icns ${ICONSET_DIR} -o build/icon.icns' on a Mac to produce the .icns file."
fi

# ---------------------------------------------------------------------------
# Linux PNGs (standard sizes for .desktop / AppImage)
# ---------------------------------------------------------------------------
LINUX_ICONS="build/icons"
mkdir -p "$LINUX_ICONS"

info "Generating Linux PNGs…"
for SIZE in 16 32 48 64 128 256 512 1024; do
  $CONVERT "$SOURCE" -resize "${SIZE}x${SIZE}" "$LINUX_ICONS/${SIZE}x${SIZE}.png"
done

info ""
info "Done! Generated icons:"
info "  Windows: schaaq.ico"
if [[ -f "build/icon.icns" ]]; then
  info "  macOS:   build/icon.icns"
else
  info "  macOS:   build/icon.iconset/ (run iconutil on a Mac)"
fi
info "  Linux:   build/icons/*.png"
