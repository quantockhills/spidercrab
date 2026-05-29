#!/bin/bash
# Lint the C++ extension source files with clang-tidy
#
# Usage:
#   bash lint.sh              # Lint all source files
#   bash lint.sh --fix        # Apply automatic fixes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BREW_PREFIX="/home/linuxbrew/.linuxbrew"
export PATH="$BREW_PREFIX/bin:$BREW_PREFIX/opt/binutils/bin:$PATH"

MODE="${1:-}"

# Includes (same as build.sh)
INCLUDES="-I$PROJECT_DIR/reaper-sdk/sdk"
INCLUDES="$INCLUDES -I$PROJECT_DIR/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/WDL/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/WDL/WDL/jnetlib"
INCLUDES="$INCLUDES -I$PROJECT_DIR/WDL/WDL/eel2"
INCLUDES="$INCLUDES -I$PROJECT_DIR/WDL/WDL/swell"

SYSROOT="/tmp/sysroot"
SYSROOT_FLAGS="--sysroot=$SYSROOT -B$SYSROOT/usr/lib/x86_64-linux-gnu"

SRC_FILES="$SCRIPT_DIR/src/*.cpp"
FIX_FLAG=""
[ "$MODE" = "--fix" ] && FIX_FLAG="--fix"

echo "=== Linting extension source files ==="
echo ""

for f in $SRC_FILES; do
    echo "  $(basename "$f")..."
    clang-tidy $FIX_FLAG "$f" -- $INCLUDES $SYSROOT_FLAGS -std=c++17 -x c++ 2>&1 | tail -n +2
done

echo ""
echo "✅ Lint complete"
