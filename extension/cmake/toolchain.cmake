# Toolchain file for brew gcc with custom sysroot
# Usage: cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain.cmake ..

set(CMAKE_SYSROOT /tmp/sysroot)
set(CMAKE_C_COMPILER /home/linuxbrew/.linuxbrew/bin/gcc)
set(CMAKE_CXX_COMPILER /home/linuxbrew/.linuxbrew/bin/g++)
set(CMAKE_AR /home/linuxbrew/.linuxbrew/opt/binutils/bin/ar CACHE FILEPATH "Archiver")
set(CMAKE_RANLIB /home/linuxbrew/.linuxbrew/opt/binutils/bin/ranlib CACHE FILEPATH "Ranlib")

# Skip linker test — we know the compiler works, linking needs our sysroot flags
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY CACHE STRING "")

# Linker flags for the custom sysroot
set(CMAKE_EXE_LINKER_FLAGS_INIT "--sysroot=/tmp/sysroot -B/tmp/sysroot/usr/lib/x86_64-linux-gnu -L/tmp/sysroot/usr/lib/x86_64-linux-gnu -L/usr/lib/x86_64-linux-gnu -L/lib/x86_64-linux-gnu")
set(CMAKE_SHARED_LINKER_FLAGS_INIT "--sysroot=/tmp/sysroot -B/tmp/sysroot/usr/lib/x86_64-linux-gnu -L/tmp/sysroot/usr/lib/x86_64-linux-gnu -L/usr/lib/x86_64-linux-gnu -L/lib/x86_64-linux-gnu")
