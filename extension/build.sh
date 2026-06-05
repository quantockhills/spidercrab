#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BUILD_TYPE="${BUILD_TYPE:-release}"
TARGET="${TARGET:-linux}"

BREW_PREFIX="/home/linuxbrew/.linuxbrew"
export PATH="$BREW_PREFIX/bin:$BREW_PREFIX/opt/binutils/bin:$PATH"

if [ "$TARGET" = "windows" ]; then
    echo "=== WINDOWS BUILD (clang-cl + xwin) ==="
    XWIN="/home/sasha/.xwin"
    if [ ! -d "$XWIN" ]; then
        echo "ERROR: xwin not found. Install via xwin --accept-license splat --output ~/.xwin"
        exit 1
    fi
    export VCToolsInstallDir="$XWIN"
    CXX="$BREW_PREFIX/bin/clang-cl"
    if [ "$BUILD_TYPE" = "debug" ]; then
        echo "=== DEBUG BUILD ==="
        CXXFLAGS="--target=x86_64-pc-windows-msvc /std:c++17 /Od /EHsc -DDEBUG=1 -g -fuse-ld=lld"
        SUFFIX="-debug.dll"
    else
        CXXFLAGS="--target=x86_64-pc-windows-msvc /std:c++17 /O2 /DNDEBUG /EHsc -fuse-ld=lld"
        SUFFIX=".dll"
    fi
    CXXFLAGS="$CXXFLAGS /D_WIN32 /DWIN32_LEAN_AND_MEAN /DWDL_NO_JPEG /W0"
    CXXFLAGS="$CXXFLAGS /I$XWIN/crt/include /I$XWIN/sdk/include/ucrt"
    CXXFLAGS="$CXXFLAGS /I$XWIN/sdk/include/shared /I$XWIN/sdk/include/um"
    # Force winsock2.h before windows.h for SOCKET type
    FORCE_WS_H="$(mktemp /tmp/force_winsock_XXXXXX.h)"
    echo '#include <winsock2.h>
#include <ws2tcpip.h>' > "$FORCE_WS_H"
    CXXFLAGS="$CXXFLAGS -FI$FORCE_WS_H"
    SYSROOT_FLAGS=""
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

OUT="$SCRIPT_DIR/build/reaper_spidercrab$SUFFIX"
mkdir -p "$SCRIPT_DIR/build"

echo "CXX: $CXX"
echo "Output: $OUT"
echo ""

if [ "$TARGET" = "windows" ]; then
    # Windows: compile each source with clang-cl, link with lld-link
    rm -rf "$SCRIPT_DIR/build/obj"
    mkdir -p "$SCRIPT_DIR/build/obj"
    OBJ_FILES=""
    for src in $SRC; do
        obj="$SCRIPT_DIR/build/obj/$(basename $src .cpp).obj"
        echo "  CC $(basename $src)"
        $CXX $CXXFLAGS $INCLUDES -c "$src" -Fo"$obj" 2>&1
        OBJ_FILES="$OBJ_FILES $obj"
    done
    echo "  LD $(basename $OUT)"
    clang-cl --target=x86_64-pc-windows-msvc $OBJ_FILES -fuse-ld=lld \
        -o "$OUT" /link /dll \
        /libpath:"$XWIN/crt/lib/x86_64" \
        /libpath:"$XWIN/sdk/lib/um/x86_64" \
        /libpath:"$XWIN/sdk/lib/ucrt/x86_64" \
        libcmt.lib kernel32.lib user32.lib ws2_32.lib 2>&1
    rm -rf "$SCRIPT_DIR/build/obj"
    # Clean up forced winsock include
    rm -f "$FORCE_WS_H" 2>/dev/null || true
else
    $CXX $CXXFLAGS $SYSROOT_FLAGS $INCLUDES \
        -o "$OUT" \
        $SRC \
        $LINK_FLAGS \
        2>&1
fi

echo ""
echo "✅ Build successful: $OUT"
ls -lh "$OUT"
