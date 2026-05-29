#!/bin/bash
# Build and lint the extension
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Linting ==="
bash "$SCRIPT_DIR/lint.sh"

echo ""
echo "=== Building ==="
bash "$SCRIPT_DIR/build.sh"

echo ""
echo "=== Done ==="