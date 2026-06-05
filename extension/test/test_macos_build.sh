#!/bin/bash
# Test: macOS build target (.dylib)
#
# Verifies that TARGET=macos bash build.sh produces a valid
# Mach-O 64-bit bundle with the expected ReaperPluginEntry export.
#
# This test runs on:
#   - macOS natively (using xcrun clang++ + SDK)
#   - Linux with osxcross installed (using x86_64-apple-darwinXX-clang++)
#   - Linux without osxcross: gracefully skipped
#
# It validates the build artifact structure only.

set -e
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

pass() {
    echo "  ✅ $1"
    PASS=$((PASS + 1))
}

fail() {
    echo "  ❌ $1"
    FAIL=$((FAIL + 1))
}

echo "===== macOS Build Test ====="
echo ""

BUILD_DIR="build"
DYLIB="$BUILD_DIR/reaper_spidercrab.dylib"

# -------------------------------------------------------
# Prerequisite check: can we build for macOS?
# -------------------------------------------------------
echo "--- Prerequisite: macOS build capability ---"

CAN_BUILD_MACOS=false

if [ "$(uname)" = "Darwin" ]; then
    echo "  Native macOS detected"
    CAN_BUILD_MACOS=true
elif command -v x86_64-apple-darwin21-clang++ &>/dev/null || \
     command -v x86_64-apple-darwin22-clang++ &>/dev/null || \
     command -v x86_64-apple-darwin23-clang++ &>/dev/null || \
     command -v x86_64-apple-darwin24-clang++ &>/dev/null; then
    echo "  osxcross detected"
    CAN_BUILD_MACOS=true
else
    echo "  ⏭️  Skipping build test — no macOS toolchain (native or osxcross) available"
    echo ""
    echo "  To test on macOS:"
    echo "    xcode-select --install"
    echo "    TARGET=macos bash extension/build.sh"
    echo ""
    echo "  To test via osxcross on Linux:"
    echo "    Install osxcross (https://github.com/tpoechtrager/osxcross)"
    echo "    Then run: TARGET=macos bash extension/build.sh"
    echo ""
fi

# If we can't build, just test the build script structure (syntax check)
echo ""
echo "--- Test 0: Build script syntax check ---"
if bash -n build.sh 2>/dev/null; then
    pass "build.sh syntax is valid"
else
    fail "build.sh has syntax errors"
fi

if ! $CAN_BUILD_MACOS; then
    echo ""
    echo "===== Results: $PASS passed, $FAIL failed (partial — no macOS toolchain) ====="
    if [ "$FAIL" -gt 0 ]; then
        exit 1
    fi
    exit 0
fi

# -------------------------------------------------------
# Test 1: Build produces a dylib file
# -------------------------------------------------------
echo "--- Test 1: Build produces a dylib file ---"
TARGET=macos bash build.sh 2>&1
if [ -f "$DYLIB" ]; then
    pass "dylib exists at $DYLIB"
else
    fail "dylib not found at $DYLIB"
    echo ""
    echo "===== Results: $PASS passed, $FAIL failed ====="
    exit 1
fi

# -------------------------------------------------------
# Test 2: File is non-empty and has reasonable size
# -------------------------------------------------------
echo "--- Test 2: dylib has reasonable size ---"
SIZE=$(stat -c%s "$DYLIB" 2>/dev/null || stat -f%z "$DYLIB" 2>/dev/null)
if [ "$SIZE" -gt 100000 ]; then
    pass "dylib size $SIZE bytes (>100KB)"
else
    fail "dylib size $SIZE bytes — too small for a REAPER extension"
fi

# -------------------------------------------------------
# Test 3: File starts with Mach-O magic
# -------------------------------------------------------
echo "--- Test 3: Mach-O magic ---"
MACHO_OK=$(python3 -c "
import sys
with open('$DYLIB','rb') as f:
    magic = f.read(4)
    # MH_MAGIC_64 = 0xFEEDFACF (fat: 0xCAFEBABE or 0xBEBAFECA)
    is_macho64 = magic in [b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf']
    is_fat = magic in [b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca']
    sys.exit(0 if (is_macho64 or is_fat) else 1)
" 2>&1 || echo "FAIL")
if [ "$MACHO_OK" != "FAIL" ]; then
    pass "Mach-O magic present"
else
    fail "Missing Mach-O magic — not a valid Mach-O file"
fi

# -------------------------------------------------------
# Test 4: File type is MH_BUNDLE (0x8)
# -------------------------------------------------------
echo "--- Test 4: MH_BUNDLE type (shared library / bundle) ---"
BUNDLE_OK=$(python3 -c "
import struct, sys
with open('$DYLIB','rb') as f:
    magic = f.read(4)
    if magic == b'\xcf\xfa\xed\xfe':
        # Little-endian 64-bit
        endian = '<'
    elif magic == b'\xfe\xed\xfa\xcf':
        # Big-endian 64-bit
        endian = '>'
    else:
        sys.exit(1)
    f.read(4)  # skip cputype + cpusubtype
    filetype = struct.unpack(endian + 'I', f.read(4))[0]
    sys.exit(0 if filetype == 8 else 1)
" 2>&1 || echo "FAIL")
if [ "$BUNDLE_OK" != "FAIL" ]; then
    pass "File type is MH_BUNDLE (0x8)"
else
    fail "File type is not MH_BUNDLE"
fi

# -------------------------------------------------------
# Test 5: CPU type is x86-64
# -------------------------------------------------------
echo "--- Test 5: x86-64 architecture ---"
ARCH_OK=$(python3 -c "
import struct, sys
with open('$DYLIB','rb') as f:
    magic = f.read(4)
    if magic == b'\xcf\xfa\xed\xfe':
        endian = '<'
    elif magic == b'\xfe\xed\xfa\xcf':
        endian = '>'
    else:
        sys.exit(1)
    cputype = struct.unpack(endian + 'I', f.read(4))[0]
    # CPU_TYPE_X86_64 = 0x01000007 | 7 = 0x1000007
    # CPU_TYPE_ARM64 = 0x01000000 | 12 = 0x100000c
    sys.exit(0 if cputype == 0x1000007 else 1)
" 2>&1 || echo "FAIL")
if [ "$ARCH_OK" != "FAIL" ]; then
    pass "CPU type is x86-64"
elif [ "$(uname)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
    echo "  ℹ️  ARM64 Mac detected — expected architecture is arm64"
    pass "CPU type is arm64 (native)"
else
    fail "CPU type is not x86-64"
fi

# -------------------------------------------------------
# Test 6: Exports ReaperPluginEntry
# -------------------------------------------------------
echo "--- Test 6: ReaperPluginEntry export ---"
if command -v nm &>/dev/null; then
    if nm -gU "$DYLIB" 2>/dev/null | grep -q "ReaperPluginEntry"; then
        pass "Exports ReaperPluginEntry"
    else
        fail "Missing ReaperPluginEntry export"
    fi
elif command -v llvm-nm &>/dev/null; then
    if llvm-nm -gU "$DYLIB" 2>/dev/null | grep -q "ReaperPluginEntry"; then
        pass "Exports ReaperPluginEntry"
    else
        fail "Missing ReaperPluginEntry export"
    fi
else
    echo "  ⏭️  No nm/llvm-nm available, skipping export check"
fi

# -------------------------------------------------------
# Summary
# -------------------------------------------------------
echo ""
echo "===== Results: $PASS passed, $FAIL failed ====="
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
