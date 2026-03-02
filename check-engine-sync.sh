#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-engine-sync.sh
#
# Compares the DALC cost-engine files between Scanner and Web to ensure
# calculation logic stays identical while allowing intentional text drift
# in editorial files.
#
# Exit 0  — all strict files match (text-drift files may differ)
# Exit 1  — one or more strict files have unexpected differences
# ---------------------------------------------------------------------------

set -euo pipefail

# --- Paths (adjust if your checkout layout differs) -----------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_ENGINE="$SCRIPT_DIR/src/engine"
WEB_ENGINE="$SCRIPT_DIR/../dalculator/lib/engine"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# --- Validate paths -------------------------------------------------------
if [[ ! -d "$SCANNER_ENGINE" ]]; then
  echo -e "${RED}ERROR: Scanner engine dir not found: ${SCANNER_ENGINE}${RESET}"
  exit 1
fi
if [[ ! -d "$WEB_ENGINE" ]]; then
  echo -e "${RED}ERROR: Web engine dir not found: ${WEB_ENGINE}${RESET}"
  echo -e "${YELLOW}Hint: Expected dalculator repo at ${SCRIPT_DIR}/../dalculator${RESET}"
  exit 1
fi

echo -e "${BOLD}${CYAN}=== DALC Engine Sync Check ===${RESET}\n"

# --- Strict files (must be identical) -------------------------------------
STRICT_FILES=("engine.ts" "types.ts" "index.ts")
DRIFT_FILES=("constants.ts" "findings.ts" "properties.ts")

EXIT_CODE=0

echo -e "${BOLD}Strict files (must be identical):${RESET}"
for f in "${STRICT_FILES[@]}"; do
  SCANNER_FILE="$SCANNER_ENGINE/$f"
  WEB_FILE="$WEB_ENGINE/$f"

  if [[ ! -f "$SCANNER_FILE" ]]; then
    echo -e "  ${RED}MISSING${RESET}  Scanner: $f"
    EXIT_CODE=1
    continue
  fi
  if [[ ! -f "$WEB_FILE" ]]; then
    echo -e "  ${RED}MISSING${RESET}  Web: $f"
    EXIT_CODE=1
    continue
  fi

  if diff -q "$SCANNER_FILE" "$WEB_FILE" > /dev/null 2>&1; then
    echo -e "  ${GREEN}OK${RESET}       $f"
  else
    echo -e "  ${RED}MISMATCH${RESET}  $f"
    diff --color=always -u "$SCANNER_FILE" "$WEB_FILE" | head -40 || true
    echo ""
    EXIT_CODE=1
  fi
done

echo ""

# --- Text-drift files (expected to differ) --------------------------------
echo -e "${BOLD}Text-drift files (expected editorial differences):${RESET}"
for f in "${DRIFT_FILES[@]}"; do
  SCANNER_FILE="$SCANNER_ENGINE/$f"
  WEB_FILE="$WEB_ENGINE/$f"

  if [[ ! -f "$SCANNER_FILE" ]]; then
    echo -e "  ${RED}MISSING${RESET}  Scanner: $f"
    continue
  fi
  if [[ ! -f "$WEB_FILE" ]]; then
    echo -e "  ${RED}MISSING${RESET}  Web: $f"
    continue
  fi

  if diff -q "$SCANNER_FILE" "$WEB_FILE" > /dev/null 2>&1; then
    echo -e "  ${YELLOW}IDENTICAL${RESET} $f  (unexpected — text should differ)"
  else
    LINES_CHANGED=$(diff "$SCANNER_FILE" "$WEB_FILE" | grep -c '^[<>]' || true)
    echo -e "  ${GREEN}DRIFT${RESET}     $f  (${LINES_CHANGED} lines differ — expected)"
  fi
done

echo ""

# --- Summary --------------------------------------------------------------
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All strict engine files are in sync.${RESET}"
else
  echo -e "${RED}${BOLD}Strict file mismatch detected — sync required before release.${RESET}"
fi

exit $EXIT_CODE
