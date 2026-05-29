# This cmake module sets up cross-compilation with our custom sysroot
# It includes the necessary paths for brew gcc + system libraries

if(UNIX AND NOT APPLE)
    # Set the sysroot for brew gcc compatibility
    set(SYSROOT_DIR "/tmp/sysroot")
    
    # Use custom toolchain with sysroot
    set(CMAKE_SYSROOT "${SYSROOT_DIR}")
    
    # Add library paths
    link_directories(
        "${SYSROOT_DIR}/usr/lib/x86_64-linux-gnu"
        /usr/lib/x86_64-linux-gnu
    )
    
    # Need to set find root for libraries and includes
    set(CMAKE_FIND_ROOT_PATH "${SYSROOT_DIR}")
    set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
    set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
    set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
    set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
endif()
