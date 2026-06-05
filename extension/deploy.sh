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
# Deploy based on target platform
TARGET="${TARGET:-linux}"

if [ "$TARGET" = "macos" ] || [ "$(uname)" = "Darwin" ]; then
    # macOS deployment
    PLUGINS_DIR="$HOME/Library/Application Support/REAPER/UserPlugins"
    DYLIB_NAME="reaper_spidercrab.dylib"
    [ "$BUILD_TYPE" = "debug" ] && DYLIB_NAME="reaper_spidercrab-debug.dylib"

    mkdir -p "$PLUGINS_DIR"
    cp "$SCRIPT_DIR/build/$DYLIB_NAME" "$PLUGINS_DIR/reaper_spidercrab.dylib"

    echo "Deployed to: $PLUGINS_DIR/reaper_spidercrab.dylib"
    ls -lh "$PLUGINS_DIR/reaper_spidercrab.dylib"
else
    # Linux deployment (and portable install)
    mkdir -p "$HOME/reaper-portable/Plugins"
    cp "$SCRIPT_DIR/build/reaper_spidercrab${SUFFIX}" "$HOME/reaper-portable/Plugins/reaper_spidercrab.so"

    echo "Deployed to: $HOME/reaper-portable/Plugins/reaper_spidercrab.so"
    ls -lh "$HOME/reaper-portable/Plugins/reaper_spidercrab.so"

    # Also deploy to the user config directory (Reaper may load from here instead)
    if [ -d "$HOME/.config/REAPER/UserPlugins" ]; then
      cp "$SCRIPT_DIR/build/reaper_spidercrab${SUFFIX}" "$HOME/.config/REAPER/UserPlugins/reaper_spidercrab.so"
      echo "Also deployed to: $HOME/.config/REAPER/UserPlugins/reaper_spidercrab.so"
    fi
fi

if [ "$BUILD_TYPE" = "debug" ]; then
    echo ""
    echo "⚠️  Debug build deployed. Run Reaper with:"
    echo "   ASAN_OPTIONS=detect_leaks=1:abort_on_error=1 \\"
    echo "   LSAN_OPTIONS=suppressions=lsan.supp \\"
    echo "   ~/reaper-portable/reaper"
fi
