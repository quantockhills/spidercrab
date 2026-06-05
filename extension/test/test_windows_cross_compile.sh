#!/bin/bash
# Test: Windows cross-compilation via xwin + clang-cl
#
# Verifies that TARGET=windows bash build.sh produces a valid
# x86-64 PE32+ DLL with the expected ReaperPluginEntry export.
#
# This test runs on Linux and does NOT require Wine or REAPER.
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

echo "===== Windows Cross-Compile Test ====="
echo ""

BUILD_DIR="build"
DLL="$BUILD_DIR/reaper_spidercrab.dll"

# -------------------------------------------------------
# Test 1: Build produces a DLL file
# -------------------------------------------------------
echo "--- Test 1: Build produces a DLL file ---"
if [ -f "$DLL" ]; then
    pass "DLL exists at $DLL"
else
    fail "DLL not found at $DLL"
    echo ""
    echo "===== Results: $PASS passed, $FAIL failed ====="
    exit 1
fi

# Use python3 for reliable binary parsing
PY="python3 -c"

# -------------------------------------------------------
# Test 2: File is non-empty and has reasonable size
# -------------------------------------------------------
echo "--- Test 2: DLL has reasonable size ---"
SIZE=$(stat -c%s "$DLL" 2>/dev/null || stat -f%z "$DLL" 2>/dev/null)
if [ "$SIZE" -gt 100000 ]; then
    pass "DLL size $SIZE bytes (>100KB)"
else
    fail "DLL size $SIZE bytes — too small for a REAPER extension"
fi

# -------------------------------------------------------
# Test 3: File starts with MZ header
# -------------------------------------------------------
echo "--- Test 3: MZ header ---"
MZ_OK=$($PY "
import sys
with open('$DLL','rb') as f:
    magic = f.read(2)
    sys.exit(0 if magic == b'MZ' else 1)
" 2>&1 || echo "FAIL")
if [ "$MZ_OK" != "FAIL" ]; then
    pass "MZ DOS header present"
else
    fail "Missing MZ header — not a valid PE file"
fi

# -------------------------------------------------------
# Test 4: PE signature present at offset from e_lfanew
# -------------------------------------------------------
echo "--- Test 4: PE signature ---"
PE_OK=$($PY "
import struct, sys
with open('$DLL','rb') as f:
    f.seek(60)
    e_lfanew = struct.unpack('<I', f.read(4))[0]
    f.seek(e_lfanew)
    sig = f.read(4)
    sys.exit(0 if sig == b'PE\x00\x00' else 1)
" 2>&1 || echo "FAIL")
if [ "$PE_OK" != "FAIL" ]; then
    pass "PE signature present"
else
    fail "Missing PE signature"
fi

# -------------------------------------------------------
# Test 5: Machine type is x86-64 (0x8664)
# -------------------------------------------------------
echo "--- Test 5: x86-64 architecture ---"
ARCH_OK=$($PY "
import struct, sys
with open('$DLL','rb') as f:
    f.seek(60)
    e_lfanew = struct.unpack('<I', f.read(4))[0]
    f.seek(e_lfanew + 4)  # Skip PE sig, read COFF machine
    machine = struct.unpack('<H', f.read(2))[0]
    sys.exit(0 if machine == 0x8664 else 1)
" 2>&1 || echo "FAIL")
if [ "$ARCH_OK" != "FAIL" ]; then
    pass "Machine type is x86-64 (0x8664)"
else
    fail "Machine type is not x86-64"
fi

# -------------------------------------------------------
# Test 6: DLL flag is set (IMAGE_FILE_DLL = 0x2000)
# -------------------------------------------------------
echo "--- Test 6: DLL characteristic flag ---"
DLL_FLAG_OK=$($PY "
import struct, sys
with open('$DLL','rb') as f:
    f.seek(60)
    e_lfanew = struct.unpack('<I', f.read(4))[0]
    f.seek(e_lfanew + 4 + 18)  # Characteristics at COFF offset 18
    chars = struct.unpack('<H', f.read(2))[0]
    sys.exit(0 if (chars & 0x2000) else 1)
" 2>&1 || echo "FAIL")
if [ "$DLL_FLAG_OK" != "FAIL" ]; then
    pass "IMAGE_FILE_DLL flag set"
else
    fail "DLL flag not set"
fi

# -------------------------------------------------------
# Test 7: DLL exports ReaperPluginEntry
# -------------------------------------------------------
echo "--- Test 7: ReaperPluginEntry export ---"
if command -v llvm-objdump &>/dev/null; then
    if llvm-objdump -p "$DLL" 2>/dev/null | grep -q "ReaperPluginEntry"; then
        pass "Exports ReaperPluginEntry"
    else
        fail "Missing ReaperPluginEntry export"
    fi
else
    # Fallback: parse export table with python3
    EXPORT_OK=$($PY "
import struct, sys
with open('$DLL','rb') as f:
    data = f.read()
    # Find PE header offset
    pe_off = struct.unpack('<I', data[60:64])[0]
    # Optional header starts after PE sig (4) + COFF (20)
    opt_hdr = pe_off + 4 + 20
    # Export directory is first data directory entry (8 bytes each)
    # Number of data dir entries at opt_hdr + 108 (PE32+) or 92 (PE32)
    magic = struct.unpack('<H', data[opt_hdr:opt_hdr+2])[0]
    num_rva = struct.unpack('<I', data[opt_hdr+108:opt_hdr+112])[0] if magic == 0x20b else struct.unpack('<I', data[opt_hdr+92:opt_hdr+96])[0]
    # Export dir RVA and size
    exp_rva = struct.unpack('<I', data[opt_hdr+96:opt_hdr+100])[0]
    exp_sz  = struct.unpack('<I', data[opt_hdr+100:opt_hdr+104])[0]
    if exp_rva == 0:
        sys.exit(1)
    # Find section headers
    section_hdr = opt_hdr + 96 + 16 * num_rva
    # Convert RVA to file offset
    def rva2off(rva):
        for i in range(16):
            s = section_hdr + i * 40
            name = data[s:s+8]
            if name[0:1] == b'\x00':
                break
            vaddr = struct.unpack('<I', data[s+12:s+16])[0]
            vsize = struct.unpack('<I', data[s+8:s+12])[0]
            raw_addr = struct.unpack('<I', data[s+20:s+24])[0]
            if vaddr <= rva < vaddr + vsize:
                return rva - vaddr + raw_addr
        return None
    exp_fo = rva2off(exp_rva)
    if exp_fo is None:
        sys.exit(1)
    # Number of names
    num_names = struct.unpack('<I', data[exp_fo+24:exp_fo+28])[0]
    addr_of_names = struct.unpack('<I', data[exp_fo+32:exp_fo+36])[0]
    names_fo = rva2off(addr_of_names)
    if names_fo is None:
        sys.exit(1)
    for j in range(num_names):
        name_rva = struct.unpack('<I', data[names_fo + j*4:names_fo + j*4 + 4])[0]
        name_fo = rva2off(name_rva)
        if name_fo is None:
            continue
        end = data.find(b'\\x00', name_fo)
        name = data[name_fo:end].decode('ascii', errors='replace')
        if name == 'ReaperPluginEntry':
            sys.exit(0)
    sys.exit(1)
" 2>&1 || echo "FAIL")
    if [ "$EXPORT_OK" != "FAIL" ]; then
        pass "Exports ReaperPluginEntry"
    else
        fail "Missing ReaperPluginEntry export"
    fi
fi

# -------------------------------------------------------
# Test 8: DLL imports from WS2_32 (Winsock) and KERNEL32
# -------------------------------------------------------
echo "--- Test 8: Required imports ---"
WS32_OK="FAIL"
KERNEL_OK="FAIL"
if command -v llvm-objdump &>/dev/null; then
    IMPORTS=$(llvm-objdump -p "$DLL" 2>/dev/null)
    if echo "$IMPORTS" | grep -q "DLL Name: WS2_32.dll"; then
        WS32_OK="OK"
    fi
    if echo "$IMPORTS" | grep -q "DLL Name: KERNEL32.dll"; then
        KERNEL_OK="OK"
    fi
fi
if [ "$WS32_OK" = "OK" ]; then
    pass "Imports from WS2_32.dll (Winsock)"
else
    fail "Missing WS2_32.dll import — WebSocket server needs Winsock"
fi
if [ "$KERNEL_OK" = "OK" ]; then
    pass "Imports from KERNEL32.dll"
else
    fail "Missing KERNEL32.dll import"
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
