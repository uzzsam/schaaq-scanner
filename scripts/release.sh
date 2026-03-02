#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# release.sh — Tag a new version and trigger the build-release workflow
#
# Usage:
#   ./scripts/release.sh 0.2.0        # Tags as v0.2.0 and pushes
#   ./scripts/release.sh patch         # Bumps patch version automatically
#   ./scripts/release.sh minor         # Bumps minor version automatically
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

die() { echo -e "${RED}ERROR: $*${NC}" >&2; exit 1; }
info() { echo -e "${GREEN}$*${NC}"; }
warn() { echo -e "${YELLOW}$*${NC}"; }

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree is dirty. Commit or stash changes first."
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current version: v${CURRENT_VERSION}"

# Parse the argument
ARG="${1:-}"
if [[ -z "$ARG" ]]; then
  die "Usage: $0 <version|patch|minor|major>"
fi

# Calculate new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$ARG" in
  patch)
    NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
    ;;
  minor)
    NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
    ;;
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  *)
    # Treat as explicit version — strip leading 'v' if present
    NEW_VERSION="${ARG#v}"
    ;;
esac

TAG="v${NEW_VERSION}"
info "New version: ${TAG}"

# Confirm
read -rp "Proceed with release ${TAG}? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  warn "Aborted."
  exit 0
fi

# Update package.json version
npm version "$NEW_VERSION" --no-git-tag-version
info "Updated package.json to ${NEW_VERSION}"

# Commit version bump
git add package.json package-lock.json
git commit -m "chore: bump version to ${TAG}"

# Create annotated tag
git tag -a "$TAG" -m "Release ${TAG}"
info "Created tag ${TAG}"

# Push commit and tag
git push origin HEAD
git push origin "$TAG"
info "Pushed to origin. CI will build the release."

echo ""
info "Done! Monitor the build at:"
info "  https://github.com/uzzsam/schaaq-scanner/actions"
