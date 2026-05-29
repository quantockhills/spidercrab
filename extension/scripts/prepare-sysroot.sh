#!/bin/bash
# Prepare the sysroot for brew gcc on Linux
# Downloads and extracts needed dev packages

set -e

SYSROOT="/tmp/sysroot"

echo "Preparing build sysroot at $SYSROOT..."

# Skip if already prepared
if [ -f "$SYSROOT/usr/lib/x86_64-linux-gnu/crt1.o" ] && [ -f "$SYSROOT/usr/lib/x86_64-linux-gnu/libc.so" ]; then
    echo "Sysroot already prepared, skipping."
    exit 0
fi

mkdir -p "$SYSROOT"

# Download needed packages
echo "Downloading packages..."
cd /tmp

download() {
    local url="$1"
    local out="$2"
    if [ ! -f "$out" ] || [ "$(stat -c%s "$out")" -lt 1000 ]; then
        wget -q "$url" -O "$out" 2>&1 | tail -1
    fi
}

download "http://archive.ubuntu.com/ubuntu/pool/main/g/glibc/libc6-dev_2.39-0ubuntu8.7_amd64.deb" "/tmp/libc6-dev.deb"
download "http://archive.ubuntu.com/ubuntu/pool/main/l/linux/linux-libc-dev_6.8.0-117.117_amd64.deb" "/tmp/linux-libc-dev.deb"
download "http://archive.ubuntu.com/ubuntu/pool/main/g/glibc/libcrypt-dev_4.4.36-4build1_amd64.deb" "/tmp/libcrypt-dev.deb"

echo "Extracting packages..."
for deb in /tmp/libc6-dev.deb /tmp/linux-libc-dev.deb /tmp/libcrypt-dev.deb; do
    dpkg -x "$deb" "$SYSROOT" 2>/dev/null
done

# Create symlinks for runtime libraries
echo "Setting up library symlinks..."
mkdir -p "$SYSROOT/lib/x86_64-linux-gnu"
mkdir -p "$SYSROOT/lib64"

# Copy brew's libstdc++
BREW_PREFIX="/home/linuxbrew/.linuxbrew"
cp "$BREW_PREFIX/lib/libstdc++.so.6" "$SYSROOT/usr/lib/x86_64-linux-gnu/" 2>/dev/null || true

# Symlink system runtime libs
for lib in libc.so.6 libm.so.6 libmvec.so.1 libdl.so.2 libpthread.so.0 libcrypt.so.1 librt.so.1 libresolv.so.2 libnss_dns.so.2 libnss_files.so.2; do
    if [ -f "/lib/x86_64-linux-gnu/$lib" ]; then
        ln -sf "/lib/x86_64-linux-gnu/$lib" "$SYSROOT/lib/x86_64-linux-gnu/$lib"
    fi
done

if [ -f "/lib64/ld-linux-x86-64.so.2" ]; then
    ln -sf /lib64/ld-linux-x86-64.so.2 "$SYSROOT/lib64/ld-linux-x86-64.so.2"
fi

# Also need libgcc_s
if [ -f "/usr/lib/x86_64-linux-gnu/libgcc_s.so.1" ]; then
    ln -sf /usr/lib/x86_64-linux-gnu/libgcc_s.so.1 "$SYSROOT/usr/lib/x86_64-linux-gnu/libgcc_s.so.1"
fi

echo "✅ Sysroot ready."
