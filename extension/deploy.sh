#!/bin/bash
# Full project build + deploy script
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
mkdir -p "$HOME/reaper-portable/UserPlugins"
cp "$SCRIPT_DIR/build/reaper-ipad-ext${SUFFIX}" "$HOME/reaper-portable/UserPlugins/reaper-ipad-ext.so"

echo "Deployed to: $HOME/reaper-portable/UserPlugins/reaper-ipad-ext.so"
ls -lh "$HOME/reaper-portable/UserPlugins/reaper-ipad-ext.so"

if [ "$BUILD_TYPE" = "debug" ]; then
    echo ""
    echo "⚠️  Debug build deployed. Run Reaper with:"
    echo "   ASAN_OPTIONS=detect_leaks=1:abort_on_error=1 \\"
    echo "   LSAN_OPTIONS=suppressions=lsan.supp \\"
    echo "   ~/reaper-portable/reaper"
fi
