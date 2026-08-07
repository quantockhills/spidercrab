#include <gtest/gtest.h>

#include <WDL/jnetlib/jnetlib.h>

// Entry point for all extension tests.
// Google Test provides the main() function via gtest_main linkage.
//
// The plugin calls JNL::open_socketlib() as it loads (main.cpp), which on
// Windows is WSAStartup. The test binary never went through that path, so
// every ::socket() call failed with WSANOTINITIALISED and nothing that binds
// a port — the OSC sender and receiver — could be tested here at all.
//
// Registering it as a global environment rather than writing our own main()
// keeps gtest_main linkage intact. Unconditional, matching main.cpp: the call
// is a no-op on platforms that don't need it.
namespace {

class SocketLibEnvironment : public ::testing::Environment {
public:
    void SetUp() override { JNL::open_socketlib(); }
    void TearDown() override { JNL::close_socketlib(); }
};

const ::testing::Environment* const kSocketLibEnv =
    ::testing::AddGlobalTestEnvironment(new SocketLibEnvironment);

} // namespace
