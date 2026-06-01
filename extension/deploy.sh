#!/bin/bash
# Build + deploy to Reaper's Plugins directory
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_TYPE="${BUILD_TYPE:-release}"

echo "=== Building C++ extension (${BUILD_TYPE}) ==="
bash "$SCRIPT_DIR/build.sh"

SUFFIX=".so"
[ "$BUILD_TYPE" = "debug" ] && SUFFIX="-debug.so"

echo ""
echo "=== Deploying to Reaper ==="
# Must be named reaper_*.so (underscores, not hyphens) and in Plugins/
mkdir -p "$HOME/reaper-portable/Plugins"
cp "$SCRIPT_DIR/build/reaper_spidercrab${SUFFIX}" "$HOME/reaper-portable/Plugins/reaper_spidercrab.so"

echo "Deployed to: $HOME/reaper-portable/Plugins/reaper_spidercrab.so"
ls -lh "$HOME/reaper-portable/Plugins/reaper_spidercrab.so"

if [ "$BUILD_TYPE" = "debug" ]; then
    echo ""
    echo "⚠️  Debug build deployed. Run Reaper with:"
    echo "   ASAN_OPTIONS=detect_leaks=1:abort_on_error=1 \\"
    echo "   LSAN_OPTIONS=suppressions=lsan.supp \\"
    echo "   ~/reaper-portable/reaper"
fi
