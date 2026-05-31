#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BUILD_TYPE="${BUILD_TYPE:-release}"
TARGET="${TARGET:-linux}"

BREW_PREFIX="/home/linuxbrew/.linuxbrew"
export PATH="$BREW_PREFIX/bin:$BREW_PREFIX/opt/binutils/bin:$PATH"

if [ "$TARGET" = "windows" ]; then
    echo "=== WINDOWS BUILD (MinGW GCC) ==="
    MINGW_DIR="$BREW_PREFIX/opt/mingw-w64/toolchain-x86_64"
    CXX="$MINGW_DIR/bin/x86_64-w64-mingw32-g++"
    CXXFLAGS="-std=c++17 -fvisibility=default -O2 -DNDEBUG"
    CXXFLAGS="$CXXFLAGS -D_WIN32 -DWDL_NO_JPEG"
    CXXFLAGS="$CXXFLAGS -Wall -Wextra -Wno-unused-parameter"
    SUFFIX=".dll"
    SYSROOT_FLAGS=""
    LINK_FLAGS="-shared -static-libgcc -static-libstdc++ -static -lws2_32 -lpthread"
else
    CXX="$BREW_PREFIX/bin/g++"
    if [ "$BUILD_TYPE" = "debug" ]; then
        echo "=== DEBUG BUILD ==="
        CXXFLAGS="-std=c++17 -fvisibility=default -fPIC -DPTHREAD=1"
        CXXFLAGS="$CXXFLAGS -O0 -g3 -DDEBUG=1 -fno-omit-frame-pointer"
        CXXFLAGS="$CXXFLAGS -fsanitize=address -fsanitize=undefined"
        CXXFLAGS="$CXXFLAGS -fno-optimize-sibling-calls"
        SUFFIX="-debug.so"
    else
        echo "=== RELEASE BUILD ==="
        CXXFLAGS="-std=c++17 -fvisibility=default -fPIC -DPTHREAD=1"
        CXXFLAGS="$CXXFLAGS -O2 -DNDEBUG -g1"
        SUFFIX=".so"
    fi
    CXXFLAGS="$CXXFLAGS -Wall -Wextra -Wno-unused-parameter"
    SYSROOT="/tmp/sysroot"
    SYSROOT_FLAGS="--sysroot=$SYSROOT -I$SYSROOT/usr/include -B$SYSROOT/usr/lib/x86_64-linux-gnu"
    SYSROOT_FLAGS="$SYSROOT_FLAGS -L$SYSROOT/usr/lib/x86_64-linux-gnu"
    SYSROOT_FLAGS="$SYSROOT_FLAGS -L/usr/lib/x86_64-linux-gnu"
    SYSROOT_FLAGS="$SYSROOT_FLAGS -L/lib/x86_64-linux-gnu"
    LINK_FLAGS="-shared -lpthread -ldl"
fi

INCLUDES="-I$PROJECT_DIR/docs/reaper-sdk/sdk"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/jnetlib"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/eel2"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/swell"

SRC="$SCRIPT_DIR/src/main.cpp"
SRC="$SRC $SCRIPT_DIR/src/websocket_server.cpp"
SRC="$SRC $SCRIPT_DIR/src/command_handler.cpp"
SRC="$SRC $SCRIPT_DIR/src/sha1_utils.cpp"

WDL_DIR="$PROJECT_DIR/docs/WDL/WDL"
SRC="$SRC $WDL_DIR/jnetlib/listen.cpp"
SRC="$SRC $WDL_DIR/jnetlib/connection.cpp"
SRC="$SRC $WDL_DIR/jnetlib/util.cpp"
SRC="$SRC $WDL_DIR/jnetlib/asyncdns.cpp"
SRC="$SRC $WDL_DIR/jnetlib/webserver.cpp"
SRC="$SRC $WDL_DIR/jnetlib/httpserv.cpp"

OUT="$SCRIPT_DIR/build/reaper-ipad-ext$SUFFIX"
mkdir -p "$SCRIPT_DIR/build"

echo "CXX: $CXX"
echo "Output: $OUT"
echo ""

$CXX $CXXFLAGS $SYSROOT_FLAGS $INCLUDES \
    -o "$OUT" \
    $SRC \
    $LINK_FLAGS \
    2>&1

echo ""
echo "✅ Build successful: $OUT"
ls -lh "$OUT"
