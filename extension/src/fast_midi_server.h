#pragma once

// ============================================================
// FastMidiServer — low-latency MIDI note endpoint.
//
// REAPER calls control-surface Run() only ~30x/sec (reaper_plugin.h),
// so a note travelling through the main WebSocket server waits an
// average 16.7ms (up to 33ms) for the next tick. That is fine for
// control messages and hopeless for playing notes.
//
// FastMidiServer is a second, minimal WebSocket listener (main port+1)
// that runs its own ~1ms thread: it accepts the browser's note stream,
// parses tiny noteOn/noteOff frames, and hands them straight to the
// note callback — no Run() polling involved.
//
// Threading contract:
//   - The thread owns all socket I/O; Start/Stop synchronize via
//     m_connMutex, so no connection is ever touched after deletion.
//   - The note callback must not call REAPER project APIs. The
//     CommandHandler fast path only reads an atomically-published
//     selected-track pointer and calls StuffMIDIMessage (a queue push
//     into the VKB input, safe from any thread).
// ============================================================

#ifdef _WIN32
#define _WINSOCKAPI_
#include <winsock2.h>
#include <ws2tcpip.h>
#endif
#include <WDL/jnetlib/jnetlib.h>
#include <WDL/ptrlist.h>
#include <WDL/wdlcstring.h>

#undef max
#undef min

#include <atomic>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class FastMidiServer {
public:
    using NoteCallback = std::function<void(int status, int d1, int d2)>;
    using PollCallback = std::function<void()>;
    using DisconnectCallback = std::function<void()>;

    static const int kMaxFrameSize = 16 * 1024;

    FastMidiServer() = default;
    ~FastMidiServer();

    FastMidiServer(const FastMidiServer&) = delete;
    FastMidiServer& operator=(const FastMidiServer&) = delete;

    bool Start(int port);
    void Stop();
    bool IsRunning() const { return m_running.load(); }

    void SetNoteCallback(NoteCallback cb) { m_noteCb = std::move(cb); }
    void SetPollCallback(PollCallback cb) { m_pollCb = std::move(cb); }
    // Fired when a connected client drops (browser refresh/close), so the
    // host can panic any notes the connection was holding.
    void SetDisconnectCallback(DisconnectCallback cb) { m_disconnectCb = std::move(cb); }

    // -- Pure helpers, socket-free (unit-tested) --

    // Build the HTTP 101 switching-protocols response for a
    // Sec-WebSocket-Key (RFC 6455 handshake).
    static std::string BuildUpgradeResponse(const std::string& key);

    // Parse WebSocket frames from the buffer. For every midi/noteOn or
    // midi/noteOff text frame, calls onNote with the materialized status
    // byte (0x90/0x80 | channel). Returns the number of frames consumed
    // (0 when waiting for more bytes). Returns -1 on a fatal protocol
    // error or a close frame — the caller must drop the connection.
    static int ParseFrames(std::vector<char>& buf, const NoteCallback& onNote);

private:
    struct Conn {
        JNL_IConnection* conn = nullptr;
        std::vector<char> recvBuf;
        bool handshakeDone = false;
    };

    void ThreadLoop();
    void HandleReadLocked(Conn* c, int index);
    void RemoveConnLocked(int index);

    std::atomic<bool> m_running{false};
    std::atomic<bool> m_stop{true};
    JNL_IListen* m_listener = nullptr;
    WDL_PtrList<Conn> m_conns;
    std::mutex m_connMutex; // guards m_listener + m_conns (Stop vs thread)
    std::thread m_thread;
    NoteCallback m_noteCb;
    PollCallback m_pollCb;
    DisconnectCallback m_disconnectCb;
};
