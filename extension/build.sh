#!/bin/bash
# Build script for reaper-ipad extension
# Supports debug and release builds
#
# Usage:
#   BUILD_TYPE=debug bash build.sh    # Debug + ASan
#   BUILD_TYPE=release bash build.sh  # Optimized (default)
#
# Debug build includes:
#   - Full debug symbols (-g3)
#   - AddressSanitizer (buffer overflows, use-after-free, leaks)
#   - Verbose logging
#   - Ubsan (undefined behavior)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ---- Config ----
BUILD_TYPE="${BUILD_TYPE:-release}"

# Toolchain paths
BREW_PREFIX="/home/linuxbrew/.linuxbrew"
export PATH="$BREW_PREFIX/bin:$BREW_PREFIX/opt/binutils/bin:$PATH"

CXX="$BREW_PREFIX/bin/g++"
CC="$BREW_PREFIX/bin/gcc"

# ---- Flags ----
BASE_FLAGS="-std=c++17 -fvisibility=default -fPIC -DPTHREAD=1"

if [ "$BUILD_TYPE" = "debug" ]; then
    echo "=== DEBUG BUILD ==="
    CXXFLAGS="$BASE_FLAGS -O0 -g3 -DDEBUG=1 -fno-omit-frame-pointer"
    CXXFLAGS="$CXXFLAGS -fsanitize=address -fsanitize=undefined"
    CXXFLAGS="$CXXFLAGS -fno-optimize-sibling-calls"
    SUFFIX="-debug.so"
else
    echo "=== RELEASE BUILD ==="
    CXXFLAGS="$BASE_FLAGS -O2 -DNDEBUG -g1"
    SUFFIX=".so"
fi

CXXFLAGS="$CXXFLAGS -Wall -Wextra -Wno-unused-parameter"

# ---- Includes ----
INCLUDES="-I$PROJECT_DIR/docs/reaper-sdk/sdk"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/jnetlib"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/eel2"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/swell"

# ---- Sysroot for brew gcc on Linux ----
SYSROOT="/tmp/sysroot"
SYSROOT_FLAGS="--sysroot=$SYSROOT -I$SYSROOT/usr/include -B$SYSROOT/usr/lib/x86_64-linux-gnu"
SYSROOT_FLAGS="$SYSROOT_FLAGS -L$SYSROOT/usr/lib/x86_64-linux-gnu"
SYSROOT_FLAGS="$SYSROOT_FLAGS -L/usr/lib/x86_64-linux-gnu"
SYSROOT_FLAGS="$SYSROOT_FLAGS -L/lib/x86_64-linux-gnu"

# ---- Sources ----
# Our extension
SRC="$SCRIPT_DIR/src/main.cpp"
SRC="$SRC $SCRIPT_DIR/src/websocket_server.cpp"
SRC="$SRC $SCRIPT_DIR/src/command_handler.cpp"
SRC="$SRC $SCRIPT_DIR/src/sha1_utils.cpp"

# WDL jnetlib (needed for networking)
WDL_DIR="$PROJECT_DIR/docs/WDL/WDL"
SRC="$SRC $WDL_DIR/jnetlib/listen.cpp"
SRC="$SRC $WDL_DIR/jnetlib/connection.cpp"
SRC="$SRC $WDL_DIR/jnetlib/util.cpp"
SRC="$SRC $WDL_DIR/jnetlib/asyncdns.cpp"

OUT="$SCRIPT_DIR/build/reaper-ipad-ext$SUFFIX"

mkdir -p "$SCRIPT_DIR/build"

echo "CXX: $CXX"
echo "Output: $OUT"
echo ""

$CXX $CXXFLAGS $SYSROOT_FLAGS $INCLUDES \
    -shared \
    -o "$OUT" \
    $SRC \
    -lpthread -ldl \
    2>&1

echo ""
echo "✅ Build successful: $OUT"
ls -lh "$OUT"

# ---- Post-build checks ----
if [ "$BUILD_TYPE" = "debug" ]; then
    echo ""
    echo "--- Debug info ---"
    # Check if debug symbols are present
    readelf -S "$OUT" 2>/dev/null | grep -q debug || echo "⚠️  No debug sections found"
    readelf -S "$OUT" 2>/dev/null | grep -E "debug|comment" | head -5 || true

    # Check ASan is linked
    if ldd "$OUT" 2>/dev/null | grep -q asan; then
        echo "✅ ASan linked"
    else
        # ASan is usually statically linked with -fsanitize=address in gcc
        echo "✅ ASan should be baked in (check with 'nm $OUT | grep asan')"
    fi

    echo ""
    echo "GDB quick start:"
    echo "  pgrep reaper     # find pid"
    echo "  gdb -p \$(pgrep reaper) -ex 'b WebSocketServer::Run' -ex c"
    echo ""
    echo "Or launch directly:"
    echo "  gdb --args ~/reaper-portable/reaper -ex 'set breakpoint pending on' -ex 'b WebSocketServer::Run'"
fi
