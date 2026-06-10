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
    CXX="$BREW_PREFIX/bin/clang-cl"
    if [ "$BUILD_TYPE" = "debug" ]; then
        echo "=== DEBUG BUILD ==="
        CXXFLAGS="--target=x86_64-pc-windows-msvc /std:c++17 /Od /EHsc -DDEBUG=1 -g"
        SUFFIX="-debug.dll"
    else
        CXXFLAGS="--target=x86_64-pc-windows-msvc /std:c++17 /O2 /DNDEBUG /EHsc"
        SUFFIX=".dll"
    fi
    CXXFLAGS="$CXXFLAGS /D_WIN32 /DWIN32_LEAN_AND_MEAN /DWDL_NO_JPEG /W0"
    CXXFLAGS="$CXXFLAGS /I$XWIN/crt/include /I$XWIN/sdk/include/ucrt"
    CXXFLAGS="$CXXFLAGS /I$XWIN/sdk/include/shared /I$XWIN/sdk/include/um"
    # Force winsock2.h before windows.h for SOCKET type
    CXXFLAGS="$CXXFLAGS -FI/tmp/force_winsock.h"
    SYSROOT_FLAGS=""
elif [ "$TARGET" = "macos" ]; then
    echo "=== macOS BUILD (.dylib) ==="

    if [ "$(uname)" = "Darwin" ]; then
        # Native macOS build using Xcode CLT
        echo "  Native macOS build (xcrun)"
        CXX="$(xcrun --sdk macosx --find clang++ 2>/dev/null || echo clang++)"
        SYSROOT_FLAGS="-isysroot $(xcrun --sdk macosx --show-sdk-path 2>/dev/null)"
    elif command -v x86_64-apple-darwin21-clang++ &>/dev/null || \
         command -v x86_64-apple-darwin22-clang++ &>/dev/null || \
         command -v x86_64-apple-darwin23-clang++ &>/dev/null || \
         command -v x86_64-apple-darwin24-clang++ &>/dev/null; then
        # osxcross cross-compilation on Linux
        for cc in x86_64-apple-darwin21-clang++ x86_64-apple-darwin22-clang++ \
                  x86_64-apple-darwin23-clang++ x86_64-apple-darwin24-clang++; do
            if command -v "$cc" &>/dev/null; then
                CXX="$cc"
                break
            fi
        done
        OSXCROSS_SDK="${OSXCROSS_SDK:-/opt/osxcross/SDK/MacOSX.sdk}"
        if [ ! -d "$OSXCROSS_SDK" ]; then
            echo "ERROR: macOS SDK not found at $OSXCROSS_SDK"
            echo "Set OSXCROSS_SDK env var to your MacOSX.sdk path"
            exit 1
        fi
        SYSROOT_FLAGS="-isysroot $OSXCROSS_SDK"
        echo "  osxcross cross-compile ($CXX)"
    else
        echo "ERROR: macOS build target requires either:"
        echo "  1. macOS (Xcode CLT): xcode-select --install"
        echo "  2. osxcross on Linux: https://github.com/tpoechtrager/osxcross"
        exit 1
    fi

    COMMON_FLAGS="-std=c++17 -fvisibility=default -fPIC -DPTHREAD=1"
    COMMON_FLAGS="$COMMON_FLAGS -Wall -Wextra -Wno-unused-parameter"

    if [ "$BUILD_TYPE" = "debug" ]; then
        echo "=== DEBUG BUILD ==="
        CXXFLAGS="$COMMON_FLAGS -O0 -g3 -DDEBUG=1 -fno-omit-frame-pointer"
        SUFFIX="-debug.dylib"
    else
        echo "=== RELEASE BUILD ==="
        CXXFLAGS="$COMMON_FLAGS -O2 -DNDEBUG -g1"
        SUFFIX=".dylib"
    fi

    LINK_FLAGS="-dynamiclib -lpthread"
    # macOS requires Cocoa/Carbon frameworks for SWELL
    LINK_FLAGS="$LINK_FLAGS -framework Cocoa -framework Carbon"
    # dlopen/dlsym are in libSystem on macOS — no -ldl needed
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

INCLUDES="-I$SCRIPT_DIR/src"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/reaper-sdk/sdk"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/jnetlib"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/eel2"
INCLUDES="$INCLUDES -I$PROJECT_DIR/docs/WDL/WDL/swell"

SRC="$SCRIPT_DIR/src/main.cpp"
SRC="$SRC $SCRIPT_DIR/src/websocket_server.cpp"
SRC="$SRC $SCRIPT_DIR/src/command_handler.cpp"
SRC="$SRC $SCRIPT_DIR/src/fx_tags.cpp"
SRC="$SRC $SCRIPT_DIR/src/fxchain_cache.cpp"
SRC="$SRC $SCRIPT_DIR/src/sample_cache.cpp"
SRC="$SRC $SCRIPT_DIR/src/sample_tags.cpp"
SRC="$SRC $SCRIPT_DIR/src/MiniBpm.cpp"
SRC="$SRC $SCRIPT_DIR/src/sha1_utils.cpp"

# Domain-specific handler files (split from command_handler.cpp)
SRC="$SRC $SCRIPT_DIR/src/handlers/track_handlers.cpp"
SRC="$SRC $SCRIPT_DIR/src/handlers/fx_handlers.cpp"
SRC="$SRC $SCRIPT_DIR/src/handlers/fxchain_handlers.cpp"
SRC="$SRC $SCRIPT_DIR/src/handlers/sample_handlers.cpp"
SRC="$SRC $SCRIPT_DIR/src/handlers/transport_handlers.cpp"
SRC="$SRC $SCRIPT_DIR/src/handlers/matrix_handlers.cpp"
SRC="$SRC $SCRIPT_DIR/src/handlers/playtime_handlers.cpp"
SRC="$SRC $SCRIPT_DIR/src/handlers/settings_handlers.cpp"

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

# Pre-create forced winsock include
echo '#include <winsock2.h>
#include <ws2tcpip.h>' > /tmp/force_winsock.h

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
else
    # macOS and Linux: single-step compile and link
    $CXX $CXXFLAGS $SYSROOT_FLAGS $INCLUDES \
        -o "$OUT" \
        $SRC \
        $LINK_FLAGS \
        2>&1
fi

# Ad-hoc codesign for macOS (required by SIP to load unsigned dylibs)
if [ "$TARGET" = "macos" ] && command -v codesign &>/dev/null; then
    echo "  Codesigning $OUT..."
    codesign --force --deep --sign - "$OUT" 2>/dev/null || \
        echo "  ⚠️  Codesigning failed (non-fatal — may need SIP exception)"
fi

echo ""
echo "✅ Build successful: $OUT"
ls -lh "$OUT"
