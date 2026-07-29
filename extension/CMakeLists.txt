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
    ${CMAKE_CURRENT_SOURCE_DIR}/src
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
    ${WDL_DIR}/WDL/jnetlib/webserver.cpp
    ${WDL_DIR}/WDL/jnetlib/httpserv.cpp
)

# ---- Extension source files ----
set(EXTENSION_SOURCES
    src/main.cpp
    src/websocket_server.cpp
    src/command_handler.cpp
    src/fx_tags.cpp
    src/sample_tags.cpp
    src/fxchain_cache.cpp
    src/sample_cache.cpp
    src/sha1_utils.cpp
    src/MiniBpm.cpp
    src/handlers/track_handlers.cpp
    src/handlers/fx_handlers.cpp
    src/handlers/fxchain_handlers.cpp
    src/handlers/sample_handlers.cpp
    src/handlers/transport_handlers.cpp
    src/handlers/matrix_handlers.cpp
    src/handlers/playtime_handlers.cpp
    src/handlers/settings_handlers.cpp
    ${WDL_SOURCES}
)

# ---- Test source files (no main.cpp — that's the Reaper entry point) ----
set(TEST_SOURCES
    src/websocket_server.cpp
    src/fx_tags.cpp
    src/sample_tags.cpp
    src/fxchain_cache.cpp
    src/sample_cache.cpp
    src/sha1_utils.cpp
    src/MiniBpm.cpp
    src/handlers/track_handlers.cpp
    src/handlers/fx_handlers.cpp
    src/handlers/fxchain_handlers.cpp
    src/handlers/sample_handlers.cpp
    src/handlers/transport_handlers.cpp
    src/handlers/matrix_handlers.cpp
    src/handlers/playtime_handlers.cpp
    src/handlers/settings_handlers.cpp
    ${WDL_SOURCES}
    test/test_main.cpp
    test/test_command_handler.cpp
    test/test_frontend_server.cpp
    test/test_sha1_utils.cpp
    test/test_websocket.cpp
    test/test_osc.cpp
)

# ============================================================
# 1. Extension shared library (for Reaper)
# ============================================================
add_library(reaper-spidercrab SHARED ${EXTENSION_SOURCES})
if(APPLE)
    set_target_properties(reaper-spidercrab PROPERTIES
        OUTPUT_NAME reaper_spidercrab
        PREFIX ""
        SUFFIX ".dylib"
        LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
    )
    # SWELL_PROVIDED_BY_APP + swell-modstub.mm: the standard way a REAPER
    # extension resolves SWELL's Windows-shaped GUI API (CreatePopupMenu,
    # InsertMenuItem, etc.) from the host app at load time, via REAPER's
    # own app delegate (queried through a static initializer that runs
    # automatically when this dylib loads, before ReaperPluginEntry is
    # even called) — this is what lets the Extensions-menu code below work
    # on macOS instead of being Windows-only.
    target_sources(reaper-spidercrab PRIVATE ${WDL_DIR}/WDL/swell/swell-modstub.mm)
    target_compile_definitions(reaper-spidercrab PRIVATE SWELL_PROVIDED_BY_APP)
    target_link_libraries(reaper-spidercrab PRIVATE pthread)
    target_link_libraries(reaper-spidercrab PRIVATE "-framework Cocoa" "-framework Carbon")
    target_compile_definitions(reaper-spidercrab PRIVATE PTHREAD=1)
elseif(UNIX)
    set_target_properties(reaper-spidercrab PROPERTIES
        OUTPUT_NAME reaper_spidercrab
        PREFIX ""
        SUFFIX ".so"
        LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
    )
    # Linux equivalent of the macOS modstub above (SWELL_dllMain export,
    # resolved by REAPER at load time) — not CI-verified (no Linux build
    # job exists yet), but mirrors the same pattern main.cpp already
    # shares between Mac and Linux for everything else non-Windows.
    target_sources(reaper-spidercrab PRIVATE ${WDL_DIR}/WDL/swell/swell-modstub-generic.cpp)
    target_compile_definitions(reaper-spidercrab PRIVATE SWELL_PROVIDED_BY_APP)
    target_link_libraries(reaper-spidercrab PRIVATE pthread dl)
    target_compile_definitions(reaper-spidercrab PRIVATE PTHREAD=1)
else()
    set_target_properties(reaper-spidercrab PROPERTIES
        OUTPUT_NAME reaper_spidercrab
        PREFIX ""
        SUFFIX ".dll"
        LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
    )
    target_link_libraries(reaper-spidercrab PRIVATE ws2_32 iphlpapi)
endif()

# ============================================================
# 2. Unit tests (standalone executable, no Reaper needed)
# ============================================================
# On by default so `make test` works as before. Configure with
# -DSPIDERCRAB_BUILD_TESTS=OFF to skip the GoogleTest download when you only
# need the extension DLL (used by the release CI).
option(SPIDERCRAB_BUILD_TESTS "Build the unit-test target (downloads GoogleTest)" ON)

if(SPIDERCRAB_BUILD_TESTS)

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

endif() # SPIDERCRAB_BUILD_TESTS
