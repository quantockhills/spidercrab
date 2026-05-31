cmake_minimum_required(VERSION 3.16)
project(reaper-ipad LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ---- Paths ----
set(WDL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../docs/WDL")
set(SDK_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../docs/reaper-sdk/sdk")

# ---- Include paths ----
include_directories(
    ${SDK_DIR}
    ${WDL_DIR}
    ${WDL_DIR}/WDL
    ${WDL_DIR}/WDL/jnetlib
    ${WDL_DIR}/WDL/eel2
    ${WDL_DIR}/WDL/swell
)

# ---- WDL jnetlib sources (needed for networking) ----
set(WDL_SOURCES
    ${WDL_DIR}/WDL/jnetlib/listen.cpp
    ${WDL_DIR}/WDL/jnetlib/connection.cpp
    ${WDL_DIR}/WDL/jnetlib/util.cpp
    ${WDL_DIR}/WDL/jnetlib/asyncdns.cpp
)

# ---- Extension source files ----
set(EXTENSION_SOURCES
    src/main.cpp
    src/websocket_server.cpp
    src/command_handler.cpp
    src/sha1_utils.cpp
    ${WDL_SOURCES}
)

# ---- Test source files (no main.cpp — that's the Reaper entry point) ----
set(TEST_SOURCES
    src/websocket_server.cpp
    src/sha1_utils.cpp
    ${WDL_SOURCES}
    test/test_main.cpp
    test/test_command_handler.cpp
    test/test_frontend_server.cpp
    test/test_sha1_utils.cpp
    test/test_websocket.cpp
)

# ============================================================
# 1. Extension shared library (for Reaper)
# ============================================================
add_library(reaper-ipad-ext SHARED ${EXTENSION_SOURCES})
set_target_properties(reaper-ipad-ext PROPERTIES
    PREFIX ""
    SUFFIX ".so"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
)

if(UNIX)
    target_link_libraries(reaper-ipad-ext PRIVATE pthread dl)
    target_compile_definitions(reaper-ipad-ext PRIVATE PTHREAD=1)
endif()

# ============================================================
# 2. Unit tests (standalone executable, no Reaper needed)
# ============================================================
# Google Test via FetchContent — downloads on first build
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.15.2
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

add_executable(reaper-ipad-test ${TEST_SOURCES})
target_link_libraries(reaper-ipad-test PRIVATE gtest gtest_main)
if(UNIX)
    target_link_libraries(reaper-ipad-test PRIVATE pthread dl)
    target_compile_definitions(reaper-ipad-test PRIVATE PTHREAD=1)
elseif(WIN32)
    target_link_libraries(reaper-ipad-test PRIVATE ws2_32)
endif()
target_compile_options(reaper-ipad-test PRIVATE -Wall -Wextra -Wno-unused-parameter)

# Register test with CTest
include(CTest)
enable_testing()
add_test(NAME reaper-ipad-test COMMAND reaper-ipad-test)
