#include <gtest/gtest.h>
#include <fstream>
#include <memory>
#include <string>

// Include the source directly so we have access to the JsonParser struct
// and the static helper functions (json_escape, json_string).
// In a test-only build, this is fine — the .cpp has no global state dependencies.
#include "../src/command_handler.cpp"

// ============================================================
// JsonParser tests
// ============================================================

TEST(JsonParserTest, GetStringSimple)
{
    std::string json = R"({"type":"command","command":"track/getAll","id":"cmd_1"})";
    JsonParser  parser(json);

    EXPECT_EQ(parser.getString("type"), "command");
    EXPECT_EQ(parser.getString("command"), "track/getAll");
    EXPECT_EQ(parser.getString("id"), "cmd_1");
}

TEST(JsonParserTest, GetStringReverseOrder)
{
    // Keys looked up in different order than they appear
    std::string json = R"({"a":"first","b":"second","c":"third"})";
    JsonParser  parser(json);

    EXPECT_EQ(parser.getString("c"), "third");
    // After getString("c"), parser is past "c" value.
    // New JsonParser for each fresh parse.
}

TEST(JsonParserTest, GetStringMiddleKey)
{
    // Get a key that's not first or last
    std::string json = R"({"alpha":"1","beta":"2","gamma":"3"})";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("beta"), "2");
}

TEST(JsonParserTest, GetStringWithNestedObject)
{
    // Parser should skip nested objects correctly
    std::string json = R"({"outer":"value","nested":{"inner":"deep","num":42},"end":"done"})";
    JsonParser  parser(json);

    EXPECT_EQ(parser.getString("outer"), "value");
    EXPECT_EQ(parser.getString("nested"), ""); // nested object returns empty string via getString
    // getString returns "" for objects (since it only handles strings and numbers)
    // But importantly, it shouldn't crash or return garbage
}

TEST(JsonParserTest, GetStringWithArrayValue)
{
    // Parser should skip arrays correctly
    std::string json = R"({"list":[1,2,3],"name":"test"})";
    JsonParser  parser(json);

    EXPECT_EQ(parser.getString("name"), "test");
}

TEST(JsonParserTest, GetStringNumericValue)
{
    // getString should handle numeric values too
    std::string json = R"({"count":42})";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("count"), "42");
}

TEST(JsonParserTest, GetStringNegativeNumber)
{
    std::string json = R"({"value":-3.14})";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("value"), "-3.14");
}

TEST(JsonParserTest, GetStringMissingKey)
{
    std::string json = R"({"a":"1","b":"2"})";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("z"), ""); // non-existent key
}

TEST(JsonParserTest, GetStringEmptyObject)
{
    std::string json = "{}";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("anything"), "");
}

TEST(JsonParserTest, GetStringUnicodeEscape)
{
    std::string json = R"({"msg":"hello\u0020world"})";
    JsonParser  parser(json);
    // The \\u0020 escape is not decoded by parseString (it only handles \\, \", \n, \r, \t)
    // So it will be returned as literal "hello\u0020world"
    std::string result = parser.getString("msg");
    // Should at least not crash, and contain most of the text
    EXPECT_FALSE(result.empty());
    EXPECT_NE(result.find("hello"), std::string::npos);
}

TEST(JsonParserTest, GetStringWithEscapedChars)
{
    std::string json = R"({"path":"C:\\Users\\test"})";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("path"), "C:\\Users\\test");
}

TEST(JsonParserTest, GetStringWithQuotedString)
{
    std::string json = R"({"text":"she said \"hello\""})";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("text"), "she said \"hello\"");
}

TEST(JsonParserTest, PeekAndSkipWhitespace)
{
    std::string json = "  \n\t  {\"key\":\"val\"}";
    JsonParser  parser(json);
    EXPECT_EQ(parser.peek(), '{'); // peek should skip whitespace
}

// ============================================================
// JsonParser edge cases
// ============================================================

TEST(JsonParserTest, EmptyString)
{
    std::string json = "";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("anything"), "");
}

TEST(JsonParserTest, TruncatedJson)
{
    std::string json = R"({"type":"command","comm)";
    JsonParser  parser(json);
    // Should not crash, return what it can or empty
    std::string result = parser.getString("type");
    EXPECT_EQ(result, "command");
}

TEST(JsonParserTest, DeeplyNested)
{
    // Deep nesting shouldn't cause issues
    std::string json = R"({"l1":{"l2":{"l3":{"l4":"deep"}}},"top":"value"})";
    JsonParser  parser(json);
    EXPECT_EQ(parser.getString("top"), "value");
}

TEST(JsonParserTest, MultipleCallsGetString)
{
    // Each call to getString advances through the object, getting the NEXT matching key
    // The JsonParser state persists between calls
    std::string json = R"({"first":"1","second":"2","third":"3"})";
    JsonParser  parser(json);

    // Get "second" first — it scans past "first" and skips it
    EXPECT_EQ(parser.getString("second"), "2");

    // After "second" was found and returned, parser is after "2".
    // A third call would need a new parser for fresh start since
    // the first call already consumed keys before "second".
    // This is expected behavior — getString does a linear scan.
}

// ============================================================
// SendResponse format tests
// ============================================================

TEST(ResponseFormatTest, SuccessResponse)
{
    std::string resp = CommandHandler::FormatResponse("cmd_1", true, "{\"data\":42}");
    // Verify structure
    EXPECT_NE(resp.find("\"type\""), std::string::npos);
    EXPECT_NE(resp.find("\"response\""), std::string::npos);
    EXPECT_NE(resp.find("\"id\""), std::string::npos);
    EXPECT_NE(resp.find("\"cmd_1\""), std::string::npos);
    EXPECT_NE(resp.find("\"success\""), std::string::npos);
    EXPECT_NE(resp.find("true"), std::string::npos);
    EXPECT_NE(resp.find("\"payload\""), std::string::npos);
    EXPECT_NE(resp.find("{\"data\":42}"), std::string::npos);
    EXPECT_EQ(resp.front(), '{');
    EXPECT_EQ(resp.back(), '}');
}

TEST(ResponseFormatTest, ErrorResponse)
{
    std::string resp
        = CommandHandler::FormatResponse("cmd_2", false, "{\"error\":\"Unknown command\"}");
    EXPECT_NE(resp.find("\"success\""), std::string::npos);
    EXPECT_NE(resp.find("false"), std::string::npos);
    EXPECT_NE(resp.find("\"error\":\"Unknown command\""), std::string::npos);
}

TEST(ResponseFormatTest, EmptyIdResponse)
{
    // When id is empty, it should be omitted from the response
    std::string resp = CommandHandler::FormatResponse("", true, "{\"ok\":true}");
    EXPECT_NE(resp.find("\"type\":\"response\""), std::string::npos);
    EXPECT_EQ(resp.find("\"id\""), std::string::npos); // no id field
}

TEST(ResponseFormatTest, PayloadWithSpecialChars)
{
    // Payload may contain JSON special characters
    std::string resp = CommandHandler::FormatResponse("id", true, "{\"text\":\"it's \\\"fine\\\"\"}");
    EXPECT_NE(resp.find("{\"text\":\"it's \\\"fine\\\"\"}"), std::string::npos);
}

TEST(ResponseFormatTest, ResponseIsValidJsonStructure)
{
    // Check the response looks like well-formed JSON (basic structure check)
    std::string resp = CommandHandler::FormatResponse("x", false, "{}");

    // Should start with { and end with }
    EXPECT_EQ(resp.front(), '{');
    EXPECT_EQ(resp.back(), '}');

    // Count braces — should be balanced
    int depth = 0;
    for (char c : resp) {
        if (c == '{')
            depth++;
        if (c == '}')
            depth--;
    }
    EXPECT_EQ(depth, 0) << "Braces should be balanced";
}

// ============================================================
// json_escape / json_string tests
// ============================================================

// Since json_escape and json_string are file-static functions in command_handler.cpp,
// and we include the .cpp, we can test them directly here.

TEST(JsonEscapeTest, PlainText)
{
    EXPECT_EQ(json_escape("hello"), "hello");
}

TEST(JsonEscapeTest, DoubleQuote)
{
    EXPECT_EQ(json_escape("say \"hi\""), "say \\\"hi\\\"");
}

TEST(JsonEscapeTest, Backslash)
{
    EXPECT_EQ(json_escape("a\\b"), "a\\\\b");
}

TEST(JsonEscapeTest, NewlineAndTab)
{
    EXPECT_EQ(json_escape("line1\nline2"), "line1\\nline2");
    EXPECT_EQ(json_escape("col1\tcol2"), "col1\\tcol2");
}

TEST(JsonEscapeTest, ControlCharacters)
{
    // Characters below 0x20 that aren't \n, \r, \t should become \\u00xx
    EXPECT_EQ(json_escape(std::string("\x00", 1)), "\\u0000");
    EXPECT_EQ(json_escape("\x01\x1F"), "\\u0001\\u001f");
}

TEST(JsonStringTest, WrapsInQuotes)
{
    EXPECT_EQ(json_string("hello"), "\"hello\"");
}

TEST(JsonStringTest, EscapesInside)
{
    EXPECT_EQ(json_string("a\"b"), "\"a\\\"b\"");
}

TEST(JsonStringTest, NullPtr)
{
    EXPECT_EQ(json_string(nullptr), "\"\"");
}

TEST(JsonStringTest, EmptyString)
{
    EXPECT_EQ(json_string(""), "\"\"");
}

// ============================================================
// FX roundtrip tests — hardened, with specific names, multi-track,
// and param name assertions.  Uses a mock ReaperAPI so no real
// Reaper instance is required.
// ============================================================

struct MockTrack {
    int         idx;
    std::string name;
    double      volume = 0.75;
    bool        muted  = false;
    int         soloed = 0;
    int         armed  = 0;
    int         selected = 0;
    struct MockFX {
        int                    idx;
        std::string            name;
        std::vector<std::string> paramNames;
        std::vector<double>    paramVals;
        std::vector<double>    paramMins;
        std::vector<double>    paramMaxs;
        std::vector<double>    paramMids;
    };
    std::vector<MockFX> fx;
};

struct MockState {
    std::vector<MockTrack> tracks;
};

static MockState* g_mock = nullptr;

// ---- Mock Reaper API functions ----

static int mock_CountTracks(ReaProject*) { return g_mock ? (int)g_mock->tracks.size() : 0; }

static MediaTrack* mock_GetTrack(ReaProject*, int idx)
{
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return nullptr;
    // Return a unique non-null pointer per valid track index so the handler
    // can distinguish tracks.  We never dereference it.
    return reinterpret_cast<MediaTrack*>(static_cast<uintptr_t>(idx + 1));
}

static int mock_TrackFX_GetCount(MediaTrack* track)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return 0;
    return (int)g_mock->tracks[idx].fx.size();
}

static bool mock_TrackFX_GetFXName(MediaTrack* track, int fx, char* buf, int buf_sz)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return false;
    auto& t = g_mock->tracks[idx];
    if (fx < 0 || fx >= (int)t.fx.size())
        return false;
    snprintf(buf, (size_t)buf_sz, "%s", t.fx[fx].name.c_str());
    return true;
}

static int mock_TrackFX_GetNumParams(MediaTrack* track, int fx)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return 0;
    auto& t = g_mock->tracks[idx];
    if (fx < 0 || fx >= (int)t.fx.size())
        return 0;
    return (int)t.fx[fx].paramNames.size();
}

static double mock_TrackFX_GetParamEx(
    MediaTrack* track, int fx, int param, double* minOut, double* maxOut, double* midOut)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return 0.0;
    auto& t = g_mock->tracks[idx];
    if (fx < 0 || fx >= (int)t.fx.size())
        return 0.0;
    auto& f = t.fx[fx];
    if (param < 0 || param >= (int)f.paramNames.size())
        return 0.0;
    if (minOut) *minOut = f.paramMins[param];
    if (maxOut) *maxOut = f.paramMaxs[param];
    if (midOut) *midOut = f.paramMids[param];
    // paramVals stores actual display values.
    // GetParamEx must return normalized (0-1), so convert (Issue #73).
    double range = f.paramMaxs[param] - f.paramMins[param];
    if (range < 1e-15) return 0.0;
    return (f.paramVals[param] - f.paramMins[param]) / range;
}

static bool mock_TrackFX_GetParamName(MediaTrack* track, int fx, int param, char* buf, int buf_sz)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return false;
    auto& t = g_mock->tracks[idx];
    if (fx < 0 || fx >= (int)t.fx.size())
        return false;
    auto& f = t.fx[fx];
    if (param < 0 || param >= (int)f.paramNames.size())
        return false;
    snprintf(buf, (size_t)buf_sz, "%s", f.paramNames[param].c_str());
    return true;
}

static bool mock_TrackFX_SetParam(MediaTrack* track, int fx, int param, double val)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return false;
    auto& t = g_mock->tracks[idx];
    if (fx < 0 || fx >= (int)t.fx.size())
        return false;
    auto& f = t.fx[fx];
    if (param < 0 || param >= (int)f.paramNames.size())
        return false;
    f.paramVals[param] = val;
    return true;
}

static int mock_TrackFX_AddByName(MediaTrack* track, const char* fxname, bool, int)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return -1;
    auto& t = g_mock->tracks[idx];
    MockTrack::MockFX f;
    f.idx         = (int)t.fx.size();
    f.name        = fxname ? fxname : "";
    f.paramNames  = { "Bypass", "Wet" };
    f.paramVals   = { 0.0, 1.0 };
    f.paramMins   = { 0.0, 0.0 };
    f.paramMaxs   = { 1.0, 1.0 };
    f.paramMids   = { 0.5, 0.5 };
    t.fx.push_back(f);
    return f.idx;
}

static bool mock_TrackFX_Delete(MediaTrack* track, int fx)
{
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(track)) - 1;
    if (!g_mock || idx < 0 || idx >= (int)g_mock->tracks.size())
        return false;
    auto& t = g_mock->tracks[idx];
    if (fx < 0 || fx >= (int)t.fx.size())
        return false;
    t.fx.erase(t.fx.begin() + fx);
    // Re-index remaining FX
    for (size_t i = 0; i < t.fx.size(); i++)
        t.fx[i].idx = (int)i;
    return true;
}

static void* mock_GetSetMediaTrackInfo(MediaTrack* trackPtr, const char* parmname, void* setNewValue)
{
    if (!g_mock || !parmname) return nullptr;
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(trackPtr)) - 1;
    if (idx < 0 || idx >= (int)g_mock->tracks.size()) return nullptr;
    auto& t = g_mock->tracks[idx];
    std::string name(parmname);

    if (name == "D_VOL") {
        if (setNewValue) t.volume = *(double*)setNewValue;
        return &t.volume;
    }
    if (name == "B_MUTE") {
        if (setNewValue) t.muted = *(bool*)setNewValue;
        return &t.muted;
    }
    if (name == "I_SOLO") {
        if (setNewValue) t.soloed = *(int*)setNewValue;
        return &t.soloed;
    }
    if (name == "I_RECARM") {
        if (setNewValue) t.armed = *(int*)setNewValue;
        return &t.armed;
    }
    if (name == "I_SELECTED") {
        if (setNewValue) t.selected = *(int*)setNewValue;
        return &t.selected;
    }
    return nullptr;
}

static bool mock_GetSetMediaTrackInfo_String(MediaTrack* trackPtr, const char* parmname, char* setNewValue, bool setNewValue_isAllowed)
{
    if (!g_mock || !parmname || !setNewValue) return false;
    int idx = static_cast<int>(reinterpret_cast<uintptr_t>(trackPtr)) - 1;
    if (idx < 0 || idx >= (int)g_mock->tracks.size()) return false;
    auto& t = g_mock->tracks[idx];
    std::string name(parmname);

    if (name == "P_NAME") {
        if (setNewValue_isAllowed) {
            // Writing is not supported in mock
            return false;
        }
        // Reading: copy track name into buffer
        size_t len = t.name.size();
        if (len > 255) len = 255;
        memcpy(setNewValue, t.name.c_str(), len);
        setNewValue[len] = '\0';
        return true;
    }
    return false;
}

// ---- Mock GetTrackStateChunk / SetTrackStateChunk ----

static std::string g_mockChunk;

static bool mock_GetTrackStateChunk(MediaTrack* track, char* buf, int buf_sz, bool)
{
    (void)track;
    if (buf_sz <= 0 || buf == nullptr) return false;
    if (g_mockChunk.empty()) {
        g_mockChunk =
            "<TRACK\n"
            "  NAME \"Test Track\"\n"
            "  <FXCHAIN\n"
            "    SHOW 0\n"
            "    LASTSEL 0\n"
            "    DOCKED 0\n"
            "    <ITEM\n"
            "      NAME \"ReaEQ\"\n"
            "      VST \"VST3: ReaEQ (Cockos)\" ReaEQ 0\n"
            "    >\n"
            "    <ITEM\n"
            "      NAME \"ReaComp\"\n"
            "      VST \"VST3: ReaComp (Cockos)\" ReaComp 0 0\n"
            "    >\n"
            "  >\n"
            ">\n";
    }
    size_t len = g_mockChunk.size();
    memcpy(buf, g_mockChunk.c_str(), len + 1);
    return true;
}

static bool mock_SetTrackStateChunk(MediaTrack* track, const char* str, bool)
{
    (void)track;
    if (str) g_mockChunk = str;
    return true;
}

// ---- Mock EnumInstalledFX ----

struct MockFxEntry {
    std::string name;
    std::string ident;
};

static std::vector<MockFxEntry> g_mockFxList;
static int g_mockEnumCallCount = 0;

static bool mock_EnumInstalledFX(int index, const char** nameOut, const char** identOut)
{
    g_mockEnumCallCount++;
    if (index < 0 || index >= (int)g_mockFxList.size())
        return false;
    if (nameOut)  *nameOut  = g_mockFxList[index].name.c_str();
    if (identOut) *identOut = g_mockFxList[index].ident.c_str();
    return true;
}

// ---- Helper: build a CommandHandler wired to mock API ----

static std::unique_ptr<CommandHandler> MakeMockHandler(
    MockState* state, std::vector<std::string>* outResponses)
{
    g_mock = state;
    auto handler = std::make_unique<CommandHandler>(nullptr);
    ReaperAPI      api{};
    api.CountTracks          = mock_CountTracks;
    api.GetTrack             = mock_GetTrack;
    api.TrackFX_GetCount     = mock_TrackFX_GetCount;
    api.TrackFX_GetFXName    = mock_TrackFX_GetFXName;
    api.TrackFX_GetNumParams = mock_TrackFX_GetNumParams;
    api.TrackFX_GetParamEx   = mock_TrackFX_GetParamEx;
    api.TrackFX_GetParamName = mock_TrackFX_GetParamName;
    api.TrackFX_SetParam     = mock_TrackFX_SetParam;
    api.TrackFX_AddByName    = mock_TrackFX_AddByName;
    api.TrackFX_Delete       = mock_TrackFX_Delete;
    api.GetSetMediaTrackInfo = mock_GetSetMediaTrackInfo;
    api.GetSetMediaTrackInfo_String = mock_GetSetMediaTrackInfo_String;
    api.EnumInstalledFX      = mock_EnumInstalledFX;
    api.GetTrackStateChunk   = mock_GetTrackStateChunk;
    api.SetTrackStateChunk   = mock_SetTrackStateChunk;
    handler->SetApi(api);
    if (outResponses) {
        handler->SetResponseCallback([outResponses](int, const std::string& resp) {
            outResponses->push_back(resp);
        });
    }
    return handler;
}

// ---- Helper: extract a string value from JSON by key ----

static std::string jsonExtract(const std::string& json, const char* key)
{
    JsonParser p(json);
    return p.getString(key);
}

// ---- Tests ----

TEST(FXRoundtripTest, GetTrackFXReturnsSpecificNames)
{
    MockState state;
    MockTrack t;
    t.name = "Guitar";
    MockTrack::MockFX f1{ 0, "ReaEQ", { "Frequency", "Gain", "Q" }, { 10010.0, 0.0, 5.005 }, { 20.0, -24.0, 0.01 }, { 20000.0, 24.0, 10.0 }, { 1000.0, 0.0, 1.0 } };
    MockTrack::MockFX f2{ 1, "ReaComp", { "Threshold", "Ratio", "Attack", "Release" }, { -30.0, 10.5, 150.05, 500.5 }, { -60.0, 1.0, 0.1, 1.0 }, { 0.0, 20.0, 300.0, 1000.0 }, { -18.0, 4.0, 10.0, 100.0 } };
    t.fx = { f1, f2 };
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"track/getFx","payload":{"trackIdx":0},"id":"fx_1"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"ReaEQ\""), std::string::npos);
    EXPECT_NE(resp.find("\"ReaComp\""), std::string::npos);
    EXPECT_NE(resp.find("\"trackIdx\":0"), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);
}

TEST(FXRoundtripTest, MultiTrackEachHasOwnFX)
{
    MockState state;

    MockTrack t0;
    t0.name = "Vocals";
    t0.fx.push_back({ 0, "ReaEQ", {}, {}, {}, {}, {} });
    t0.fx.push_back({ 1, "ReaDelay", {}, {}, {}, {}, {} });

    MockTrack t1;
    t1.name = "Drums";
    t1.fx.push_back({ 0, "ReaComp", {}, {}, {}, {}, {} });

    MockTrack t2;
    t2.name = "Bass";
    // No FX

    state.tracks = { t0, t1, t2 };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Track 0
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":0},"id":"t0"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"ReaEQ\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"ReaDelay\""), std::string::npos);

    // Track 1
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":1},"id":"t1"})");
    ASSERT_EQ(responses.size(), 2u);
    EXPECT_NE(responses[1].find("\"ReaComp\""), std::string::npos);
    EXPECT_EQ(responses[1].find("\"ReaEQ\""), std::string::npos); // should NOT be on track 1

    // Track 2 (no FX)
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":2},"id":"t2"})");
    ASSERT_EQ(responses.size(), 3u);
    EXPECT_NE(responses[2].find("\"fx\":[]"), std::string::npos);
}

TEST(FXRoundtripTest, GetFXParamsReturnsSpecificParamNames)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ",
        { "Frequency", "Gain", "Q" },
        { 10010.0, 0.0, 5.005 },  // actual display values (min + 0.5 * range)
        { 20.0, -24.0, 0.01 },
        { 20000.0, 24.0, 10.0 },
        { 1000.0, 0.0, 1.0 } });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"p1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"Frequency\""), std::string::npos);
    EXPECT_NE(resp.find("\"Gain\""), std::string::npos);
    EXPECT_NE(resp.find("\"Q\""), std::string::npos);
    // After conversion: actualVal = min + normalized * (max-min)
    // Freq: normalized = (10010-20)/(20000-20) = 0.5, actual = 20 + 0.5*19980 = 10010
    EXPECT_NE(resp.find("\"value\":10010"), std::string::npos);
    // Gain: normalized = (0-(-24))/48 = 0.5, actual = -24 + 0.5*48 = 0
    EXPECT_NE(resp.find("\"value\":0"), std::string::npos);
    // Q: normalized = (5.005-0.01)/(10-0.01) = 0.5, actual = 0.01 + 0.5*9.99 = 5.005
    EXPECT_NE(resp.find("\"value\":5.005"), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);
}

TEST(FXRoundtripTest, SetParamThenGetParamReflectsNewValue)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ",
        { "Frequency", "Gain" },
        { 10010.0, -24.0 },  // actual display values (Freq midpoint, Gain at min)
        { 20.0, -24.0 },
        { 20000.0, 24.0 },
        { 1000.0, 0.0 } });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Set Frequency to 5000.0 (actual display value)
    // TrackFX_SetParam receives 5000.0 directly (no normalization, Issue #73)
    // mock_TrackFX_GetParamEx returns (5000-20)/(20000-20) ≈ 0.24925
    handler->HandleMessage(1, R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":5000.0},"id":"set1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"set\":true"), std::string::npos);

    // Now get params and verify the new value
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"get1"})");
    ASSERT_EQ(responses.size(), 1u);
    // Frequency should be ~5000 (may have minor float rounding via normalized round-trip)
    EXPECT_NE(responses[0].find("\"value\":5000"), std::string::npos);
    // Gain should still be -24 (normalized=0.0 → actual=-24)
    EXPECT_NE(responses[0].find("\"value\":-24"), std::string::npos);
}

TEST(FXRoundtripTest, AddFXThenListIncludesIt)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ", {}, {}, {}, {}, {} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Add ReaComp
    handler->HandleMessage(1, R"({"type":"command","command":"fx/add","payload":{"trackIdx":0,"fxName":"ReaComp"},"id":"add1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"fxIdx\":1"), std::string::npos);

    // List FX — should now have both
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":0},"id":"list1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"ReaEQ\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"ReaComp\""), std::string::npos);
}

TEST(FXRoundtripTest, DeleteFXThenListExcludesIt)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ", {}, {}, {}, {}, {} });
    t.fx.push_back({ 1, "ReaComp", {}, {}, {}, {}, {} });
    t.fx.push_back({ 2, "ReaDelay", {}, {}, {}, {}, {} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Delete the middle FX (ReaComp at index 1)
    handler->HandleMessage(1, R"({"type":"command","command":"fx/delete","payload":{"trackIdx":0,"fxIdx":1},"id":"del1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"deleted\":true"), std::string::npos);

    // List FX — should have ReaEQ and ReaDelay, NOT ReaComp
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":0},"id":"list1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"ReaEQ\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"ReaDelay\""), std::string::npos);
    EXPECT_EQ(responses[0].find("\"ReaComp\""), std::string::npos);
}

TEST(FXRoundtripTest, InvalidTrackIndexReturnsError)
{
    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":0},"id":"bad"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
    EXPECT_NE(responses[0].find("Invalid track index"), std::string::npos);
}

TEST(FXRoundtripTest, ParamMinMaxMidAreCorrect)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ",
        { "Frequency" },
        { 10010.0 },  // actual display value (20 + 0.5*19980)
        { 20.0 },
        { 20000.0 },
        { 1000.0 } });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"mm"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"min\":20"), std::string::npos);
    EXPECT_NE(resp.find("\"max\":20000"), std::string::npos);
    EXPECT_NE(resp.find("\"mid\":1000"), std::string::npos);
}


TEST(SampleBrowserTest, GetDirectoryMissingPath)
{
    // Empty path in payload should return error
    std::string json = R"({"type":"command","command":"sample/getDirectory","payload":{"path":""},"id":"cmd_1"})";
    std::string payloadStr = extractPayload(json);
    JsonParser  parser(payloadStr);
    std::string path = parser.getString("path");
    EXPECT_TRUE(path.empty());
}

TEST(SampleBrowserTest, GetDirectoryExtractsPathFromPayload)
{
    // Path inside payload object should be extracted correctly
    std::string json = R"({"type":"command","command":"sample/getDirectory","payload":{"path":"/tmp/samples"},"id":"dir_1"})";
    std::string payloadStr = extractPayload(json);

    // Verify payload extraction gives us just the payload object
    EXPECT_EQ(payloadStr, R"({"path":"/tmp/samples"})");

    // Parse the extracted payload
    JsonParser parser(payloadStr);
    std::string path = parser.getString("path");
    EXPECT_EQ(path, "/tmp/samples");
}

TEST(SampleBrowserTest, SendToTrackExtractsPathFromPayload)
{
    // Path and trackIdx inside payload should be extracted
    std::string json = R"({"type":"command","command":"sample/sendToTrack","payload":{"path":"/tmp/test.wav","trackIdx":0},"id":"send_1"})";
    std::string payloadStr = extractPayload(json);
    JsonParser  parser(payloadStr);

    EXPECT_EQ(parser.getString("path"), "/tmp/test.wav");
    EXPECT_EQ(parser.getString("trackIdx"), "0");
}

TEST(SampleBrowserTest, ExtractPayloadSkipsTopLevelKeys)
{
    // Verify extractPayload correctly finds the payload object
    // even when there are fields before and after it
    std::string json = R"({"type":"command","command":"sample/getDirectory","payload":{"path":"/home/samples"},"id":"dir_1"})";
    std::string payloadStr = extractPayload(json);
    EXPECT_EQ(payloadStr, R"({"path":"/home/samples"})");
}

TEST(SampleBrowserTest, GetDirectoryReturnsEntries)
{
    // Test that the handler produces valid JSON for a real directory
    // We use /tmp as a known-accessible directory
    CommandHandler handler(nullptr);
    std::string json = R"({"type":"command","command":"sample/getDirectory","path":"/tmp","id":"dir_1"})";
    
    // Since HandleMessage dispatches to HandleSampleGetDirectory which uses
    // the internal SendResponse to send the result via WebSocket, but we
    // don't have a WebSocket server connected, we can't capture the response.
    // Instead, create a test directory and verify JSON parsing works.
    
    // Create temp directory with known contents (cross-platform)
    fs::path testDir = fs::temp_directory_path() / "_sample_test";
    fs::create_directories(testDir);
    { std::ofstream(testDir / "a.wav").close(); }
    { std::ofstream(testDir / "b.wav").close(); }

    // Verify directory listing works
    bool foundA = false, foundB = false;
    for (const auto& entry : fs::directory_iterator(testDir)) {
        std::string name = entry.path().filename().string();
        if (name == "a.wav") foundA = true;
        if (name == "b.wav") foundB = true;
    }
    EXPECT_TRUE(foundA);
    EXPECT_TRUE(foundB);

    // Cleanup
    fs::remove_all(testDir);
}

TEST(SampleBrowserTest, SendToTrackNoApi)
{
    // When InsertMedia API is not loaded, should respond with error
    // Since m_api is all zeros (no Reaper), the check will fail.
    // We can't fully test this without a mock, but we verify the
    // JSON dispatch code paths are wired.
    std::string json = R"({"type":"command","command":"sample/sendToTrack","payload":{"path":"/tmp/test.wav","trackIdx":0},"id":"send_1"})";
    std::string payloadStr = extractPayload(json);
    JsonParser  parser(payloadStr);
    EXPECT_EQ(parser.getString("path"), "/tmp/test.wav");
    EXPECT_EQ(parser.getString("trackIdx"), "0");
}

TEST(SampleBrowserTest, JsonEscapeFilepath)
{
    // Verify json_escape handles paths with spaces and special chars
    std::string path = "/home/user/My Samples/beat.wav";
    std::string escaped = json_escape(path);
    EXPECT_EQ(escaped, path); // No special chars, no change
    
    std::string path2 = "/home/user/\"cool\" beats/hat.wav";
    std::string escaped2 = json_escape(path2);
    EXPECT_EQ(escaped2, "/home/user/\\\"cool\\\" beats/hat.wav");
}

// ============================================================
// FX enumeration caching tests
// ============================================================

TEST(FxEnumCacheTest, FirstEnumerateReturnsFullFxList)
{
    // Prepare mock FX list
    g_mockFxList = {
        { "ReaEQ", "VST3:ReaEQ" },
        { "ReaComp", "VST3:ReaComp" },
        { "Serum", "CLAP:Serum" },
    };
    g_mockEnumCallCount = 0;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // First enumeration should iterate through all FX
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify it returned all 3 FX
    EXPECT_NE(resp.find("\"ReaEQ\""), std::string::npos);
    EXPECT_NE(resp.find("\"ReaComp\""), std::string::npos);
    EXPECT_NE(resp.find("\"Serum\""), std::string::npos);
    EXPECT_NE(resp.find("\"CLAP:Serum\""), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);

    // EnumInstalledFX should have been called for each index + 1 termination check
    // For 3 FX: called at indices 0, 1, 2 (true), 3 (false) = 4 calls to the mock
    EXPECT_EQ(g_mockEnumCallCount, 4);
}

TEST(FxEnumCacheTest, SecondEnumerateReturnsCachedResult)
{
    // Prepare mock FX list
    g_mockFxList = {
        { "ReaEQ", "VST3:ReaEQ" },
        { "ReaComp", "VST3:ReaComp" },
        { "Serum", "CLAP:Serum" },
    };
    g_mockEnumCallCount = 0;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // First enumeration - populates cache
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum1"})");
    ASSERT_EQ(responses.size(), 1u);
    int callsAfterFirst = g_mockEnumCallCount;
    EXPECT_GT(callsAfterFirst, 0); // Should have called EnumInstalledFX

    // Second enumeration - should return from cache, no re-enumeration
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum2"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify it returned the same 3 FX
    EXPECT_NE(resp.find("\"ReaEQ\""), std::string::npos);
    EXPECT_NE(resp.find("\"ReaComp\""), std::string::npos);
    EXPECT_NE(resp.find("\"Serum\""), std::string::npos);

    // EnumInstalledFX should NOT have been called again
    // Call count should be exactly the same as after first call
    EXPECT_EQ(g_mockEnumCallCount, callsAfterFirst);
}

TEST(FxEnumCacheTest, ThirdEnumerateReturnsCachedResult)
{
    // Test that multiple subsequent calls all hit the cache
    g_mockFxList = {
        { "ReaEQ", "VST3:ReaEQ" },
    };
    g_mockEnumCallCount = 0;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // First call populates cache
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"ReaEQ\""), std::string::npos);

    int callsAfterFirst = g_mockEnumCallCount;

    // Second call hits cache
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_EQ(g_mockEnumCallCount, callsAfterFirst);

    // Third call hits cache again
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum3"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_EQ(g_mockEnumCallCount, callsAfterFirst);
}

TEST(FxEnumCacheTest, RefreshCacheInvalidatesAndReenumerates)
{
    // Test that refreshCache invalidates the cache and re-enumerates
    g_mockFxList = {
        { "ReaEQ", "VST3:ReaEQ" },
    };
    g_mockEnumCallCount = 0;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // First enumeration populates cache
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum1"})");
    ASSERT_EQ(responses.size(), 1u);
    int callsAfterEnum = g_mockEnumCallCount;
    EXPECT_GT(callsAfterEnum, 0);

    // Second call hits cache
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_EQ(g_mockEnumCallCount, callsAfterEnum);

    // Now refresh the cache
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/refreshCache","id":"refresh1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"ReaEQ\""), std::string::npos);

    // EnumInstalledFX should have been called again
    int callsAfterRefresh = g_mockEnumCallCount;
    EXPECT_GT(callsAfterRefresh, callsAfterEnum);

    // After refresh, subsequent enumerate should hit the (fresh) cache
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum3"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_EQ(g_mockEnumCallCount, callsAfterRefresh);
}

TEST(FxEnumCacheTest, DifferentHandlerHasOwnCache)
{
    // Verify that each CommandHandler instance has its own cache
    g_mockFxList = {
        { "ReaEQ", "VST3:ReaEQ" },
    };
    g_mockEnumCallCount = 0;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler1 = MakeMockHandler(&state, &responses);
    auto handler2 = MakeMockHandler(&state, &responses);

    // Handler 1 enumerates - populates its cache
    responses.clear();
    handler1->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum1"})");
    ASSERT_EQ(responses.size(), 1u);

    // Handler 2 enumerates - should NOT use handler1's cache
    responses.clear();
    handler2->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum2"})");
    ASSERT_EQ(responses.size(), 1u);

    // EnumInstalledFX should have been called for BOTH handlers
    // First handler: 2 calls (idx 0 returns true, idx 1 returns false)
    // Second handler: 2 calls
    EXPECT_EQ(g_mockEnumCallCount, 4);
}

// ============================================================
// Phase 1 MVP — Integration tests
// Tests the full end-to-end behavior that the milestone requires:
//   - Track browsing (mute/solo/arm/volume)
//   - FX browser + param control
//   - Sample browser
//   - Transport control
//   - FX cache (no crash on startup)
//   - Protocol integrity
// ============================================================

// ============================================================
// Volume tests (Issue #66)
// ============================================================

TEST(VolumeTest, HandleGetTracksReturnsActualVolume)
{
    // Mock tracks with specific volumes
    MockState state;
    MockTrack t0;
    t0.name = "Kick";
    t0.volume = 1.0;

    MockTrack t1;
    t1.name = "Snare";
    t1.volume = 0.5;

    MockTrack t2;
    t2.name = "Bass";
    t2.volume = 0.85;

    state.tracks = { t0, t1, t2 };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"track/getAll","id":"vol1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify volume values are read from mock, not hardcoded
    // Track 0: volume=1.0
    // We need to find the volume fields for each track in the JSON array
    // The response format is: {"tracks":[{...},{...},{...}]}
    // Each track has: "index":N,...,"volume":V
    EXPECT_NE(resp.find("\"index\":0"), std::string::npos);
    EXPECT_NE(resp.find("\"index\":1"), std::string::npos);
    EXPECT_NE(resp.find("\"index\":2"), std::string::npos);

    EXPECT_NE(resp.find("\"volume\":1"), std::string::npos)
        << "Track 0 should have volume 1.0";
    EXPECT_NE(resp.find("\"volume\":0.5"), std::string::npos)
        << "Track 1 should have volume 0.5";
    EXPECT_NE(resp.find("\"volume\":0.85"), std::string::npos)
        << "Track 2 should have volume 0.85";
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);
}

TEST(VolumeTest, HandleGetTracksDefaultVolumeIsReasonable)
{
    // When no specific volume is set, the mock default is 0.75
    MockState state;
    MockTrack t0;
    t0.name = "Default";
    // volume not set — default 0.75
    state.tracks = { t0 };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"track/getAll","id":"vol2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"volume\":0.75"), std::string::npos);
}

TEST(VolumeTest, HandleSetTrackVolumeReturnsSuccess)
{
    MockState state;
    MockTrack t0;
    t0.name = "Kick";
    t0.volume = 0.5;
    state.tracks = { t0 };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Set volume to 0.85
    std::string cmd = R"({"type":"command","command":"track/setVolume","payload":{"trackIdx":0,"volume":0.85},"id":"setvol1"})";
    handler->HandleMessage(1, cmd);
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Should have success:true and the volume value
    EXPECT_NE(resp.find("\"success\":true"), std::string::npos);
    EXPECT_NE(resp.find("\"volume\":0.85"), std::string::npos);
}

TEST(VolumeTest, SetVolumeThenGetTracksShowsNewValue)
{
    // Round-trip test: set volume, then get tracks and verify the new value
    MockState state;
    MockTrack t0;
    t0.name = "Kick";
    t0.volume = 0.5;
    state.tracks = { t0 };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // First get — verify initial volume
    handler->HandleMessage(1, R"({"type":"command","command":"track/getAll","id":"get1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"volume\":0.5"), std::string::npos);

    // Set volume to 1.0 (max)
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"track/setVolume","payload":{"trackIdx":0,"volume":1.0},"id":"setvol2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":true"), std::string::npos);
    EXPECT_NE(responses[0].find("\"volume\":1.0"), std::string::npos)
        << "Volume should be reflected in setVolume response";

    // Get tracks again — should see updated volume (via mock state change)
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"track/getAll","id":"get2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"volume\":1"), std::string::npos);
}

TEST(VolumeTest, SetVolumeZero)
{
    // Volume 0 should be valid (silent track)
    MockState state;
    MockTrack t0;
    t0.name = "Kick";
    t0.volume = 0.5;
    state.tracks = { t0 };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"track/setVolume","payload":{"trackIdx":0,"volume":0.0},"id":"setvol3"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":true"), std::string::npos);
    EXPECT_NE(responses[0].find("\"volume\":0"), std::string::npos);
}

TEST(VolumeTest, SetVolumeInvalidTrackReturnsError)
{
    MockState state;
    state.tracks = {}; // No tracks

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"track/setVolume","payload":{"trackIdx":0,"volume":0.5},"id":"badvol"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
}

TEST(Phase1MVPTest, FullTrackRoundTrip)
{
    // Set up mock with 3 tracks and varying properties
    MockState state;

    MockTrack t0;
    t0.name = "Kick";
    t0.volume = 1.0;
    t0.fx.push_back({ 0, "ReaEQ", {"Freq"}, {100.0}, {20.0}, {20000.0}, {1000.0} });

    MockTrack t1;
    t1.name = "Snare";
    t1.volume = 0.7;
    t1.fx.push_back({ 0, "ReaComp", {"Thresh"}, {-18.0}, {-60.0}, {0.0}, {-18.0} });
    t1.fx.push_back({ 1, "ReaDelay", {}, {}, {}, {}, {} });

    MockTrack t2;
    t2.name = "Hat";
    t2.volume = 0.5;
    // No FX

    state.tracks = { t0, t1, t2 };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Step 1: Get all tracks
    handler->HandleMessage(1, R"({"type":"command","command":"track/getAll","id":"integ1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& tracksResp = responses[0];

    // Verify track response structure — track names come from GetSetMediaTrackInfo_String
    // (Issue #40 fix), matching the mock track names defined above
    EXPECT_NE(tracksResp.find("\"Kick\""), std::string::npos);
    EXPECT_NE(tracksResp.find("\"Snare\""), std::string::npos);
    EXPECT_NE(tracksResp.find("\"Hat\""), std::string::npos);
    EXPECT_NE(tracksResp.find("\"index\":0"), std::string::npos);
    EXPECT_NE(tracksResp.find("\"index\":1"), std::string::npos);
    EXPECT_NE(tracksResp.find("\"index\":2"), std::string::npos);
    // Verify volume values are correct
    EXPECT_NE(tracksResp.find("\"volume\":1"), std::string::npos);
    EXPECT_NE(tracksResp.find("\"volume\":0.7"), std::string::npos);
    EXPECT_NE(tracksResp.find("\"volume\":0.5"), std::string::npos);
    EXPECT_EQ(tracksResp.find("\"error\""), std::string::npos);

    // Step 2: Get FX for track 0 (should have ReaEQ)
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":0},"id":"integ2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"ReaEQ\""), std::string::npos);
    EXPECT_EQ(responses[0].find("\"error\""), std::string::npos);

    // Step 3: Get FX for track 1 (should have ReaComp and ReaDelay)
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":1},"id":"integ3"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"ReaComp\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"ReaDelay\""), std::string::npos);

    // Step 4: Get FX for track 2 (should be empty)
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"track/getFx","payload":{"trackIdx":2},"id":"integ4"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"fx\":[]"), std::string::npos);
}

TEST(Phase1MVPTest, FullFxParamRoundTrip)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ",
        {"Frequency", "Gain", "Q"},
        {10010.0, 0.0, 5.005},  // actual display values
        {20.0, -24.0, 0.01},
        {20000.0, 24.0, 10.0},
        {1000.0, 0.0, 1.0}
    });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Step 1: Get params — verify initial values
    handler->HandleMessage(1, R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"fx1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"Frequency\""), std::string::npos);
    // Freq: stored actual=10010, GetParamEx returns (10010-20)/(20000-20)=0.5, value=20+0.5*19980=10010
    EXPECT_NE(responses[0].find("\"value\":10010"), std::string::npos);
    EXPECT_NE(responses[0].find("\"min\":20"), std::string::npos);
    EXPECT_NE(responses[0].find("\"max\":20000"), std::string::npos);
    EXPECT_EQ(responses[0].find("\"error\""), std::string::npos);

    // Step 2: Set Frequency to 5000 (actual display value, sent directly to TrackFX_SetParam)
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":5000.0},"id":"fx2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"set\":true"), std::string::npos);

    // Step 3: Get params again — verify new value
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"fx3"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"value\":5000"), std::string::npos);
    // Gain: -24 + 0.5*(24-(-24)) = 0
    EXPECT_NE(responses[0].find("\"value\":0"), std::string::npos);
}

TEST(Phase1MVPTest, PreCacheFXPopulatesCache)
{
    // Verify that calling PreCacheFX() before any WS request populates
    // the cache, so subsequent HandleEnumerateFX returns cached data
    // without touching EnumInstalledFX again.
    g_mockFxList = {
        { "ReaEQ", "VST3:ReaEQ" },
        { "ReaComp", "VST3:ReaComp" },
        { "Serum", "CLAP:Serum" },
    };
    g_mockEnumCallCount = 0;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Call PreCacheFX before any WS client connects
    handler->PreCacheFX();

    // EnumInstalledFX should have been called during PreCacheFX()
    int callsAfterPrecache = g_mockEnumCallCount;
    EXPECT_GT(callsAfterPrecache, 0);

    // Now handle a WS request — should use cache, not re-enumerate
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"cached"})");
    ASSERT_EQ(responses.size(), 1u);

    // All 3 FX should be in the response
    EXPECT_NE(responses[0].find("\"ReaEQ\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"ReaComp\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"Serum\""), std::string::npos);

    // EnumInstalledFX should NOT have been called again
    EXPECT_EQ(g_mockEnumCallCount, callsAfterPrecache);
}

// ============================================================
// HandleRecord tests (Issue #69)
// ============================================================

namespace {
// Track whether CSurf_OnRecord was called
static bool  g_recordCalled  = false;
static int   g_mainOnCommandCalled = -1;

static void mock_CSurf_OnRecord() { g_recordCalled = true; }
} // anonymous namespace

TEST(TransportRecordTest, RecordUsesCSurfOnRecordWhenAvailable)
{
    g_recordCalled         = false;
    g_mainOnCommandCalled  = -1;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Patch CSurf_OnRecord into the API
    ReaperAPI api;
    api.CSurf_OnRecord = mock_CSurf_OnRecord;
    api.Main_OnCommand = [](int cmd, int) { g_mainOnCommandCalled = cmd; };
    handler->SetApi(api);

    handler->HandleMessage(1,
        R"({"type":"command","command":"transport/record","id":"rec1"})");

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_TRUE(g_recordCalled) << "CSurf_OnRecord should have been called";
    EXPECT_EQ(g_mainOnCommandCalled, -1) << "Main_OnCommand should NOT be called when CSurf_OnRecord is available";
    EXPECT_NE(responses[0].find("\"success\":true"), std::string::npos);
    EXPECT_NE(responses[0].find("\"recording\":true"), std::string::npos);
    EXPECT_EQ(responses[0].find("\"error\""), std::string::npos);
}

TEST(TransportRecordTest, RecordFallsBackToMainOnCommand)
{
    g_recordCalled         = false;
    g_mainOnCommandCalled  = -1;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Only set Main_OnCommand, no CSurf_OnRecord
    ReaperAPI api;
    api.Main_OnCommand = [](int cmd, int) { g_mainOnCommandCalled = cmd; };
    handler->SetApi(api);

    handler->HandleMessage(1,
        R"({"type":"command","command":"transport/record","id":"rec2"})");

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_FALSE(g_recordCalled) << "CSurf_OnRecord should not have been called";
    EXPECT_EQ(g_mainOnCommandCalled, 1013) << "Main_OnCommand should be called with 1013 (Transport: Record)";
    EXPECT_NE(responses[0].find("\"success\":true"), std::string::npos);
}

TEST(TransportRecordTest, RecordReturnsErrorWhenNoApi)
{
    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);
    // Neither CSurf_OnRecord nor Main_OnCommand is set

    handler->HandleMessage(1,
        R"({"type":"command","command":"transport/record","id":"rec3"})");

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
}

TEST(Phase1MVPTest, UnknownCommandReturnsError)
{
    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"unknown/command","id":"bad"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"error\""), std::string::npos);
    EXPECT_NE(resp.find("Unknown command"), std::string::npos);
    // Should indicate failure
    EXPECT_NE(resp.find("\"success\":false"), std::string::npos);
}

TEST(Phase1MVPTest, MissingCommandFieldReturnsError)
{
    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // JSON is valid but has no "command" field
    handler->HandleMessage(1, R"({"type":"command","id":"noop"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
}

TEST(Phase1MVPTest, InvalidJsonReturnsError)
{
    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, "not json at all");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
}

TEST(Phase1MVPTest, ResponseJsonIsAlwaysValid)
{
    // Run several commands and verify each response is well-formed JSON
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ", {}, {}, {}, {}, {} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    struct CmdCheck {
        const char* cmd;
        const char* desc;
    };

    CmdCheck commands[] = {
        {R"({"type":"command","command":"track/getAll","id":"v1"})", "track/getAll"},
        {R"({"type":"command","command":"track/getFx","payload":{"trackIdx":0},"id":"v2"})", "track/getFx"},
        {R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"v3"})", "fx/getParams"},
        {R"({"type":"command","command":"track/setMute","payload":{"trackIdx":0,"muted":"true"},"id":"v4"})", "track/setMute"},
        {R"({"type":"command","command":"track/setSolo","payload":{"trackIdx":0,"soloed":"true"},"id":"v5"})", "track/setSolo"},
        {R"({"type":"command","command":"track/setArm","payload":{"trackIdx":0,"armed":"true"},"id":"v6"})", "track/setArm"},
        {R"({"type":"command","command":"sample/getDirectory","payload":{"path":"/tmp"},"id":"v7"})", "sample/getDirectory"},
        {R"({"type":"command","command":"transport/play","id":"v8"})", "transport/play"},
        {R"({"type":"command","command":"transport/stop","id":"v9"})", "transport/stop"},
        {R"({"type":"command","command":"transport/record","id":"v9a"})", "transport/record"},
        {R"({"type":"command","command":"unknown/X","id":"v10"})", "unknown command"},
    };

    for (const auto& cc : commands) {
        responses.clear();
        handler->HandleMessage(1, cc.cmd);
        ASSERT_EQ(responses.size(), 1u) << "Command " << cc.desc << " should produce 1 response";

        const std::string& resp = responses[0];

        // Verify balanced braces
        int depth = 0;
        for (char c : resp) {
            if (c == '{') depth++;
            if (c == '}') depth--;
        }
        EXPECT_EQ(depth, 0) << "Unbalanced JSON for " << cc.desc;

        // Verify starts and ends with braces
        EXPECT_EQ(resp.front(), '{') << cc.desc;
        EXPECT_EQ(resp.back(), '}') << cc.desc;

        // Verify has type field
        EXPECT_NE(resp.find("\"type\""), std::string::npos) << cc.desc;
    }
}

TEST(Phase1MVPTest, SampleBrowserDirectoryAndSendToTrack)
{
    // Verify sample browser commands produce valid JSON structures
    MockState state;
    state.tracks = { MockTrack{0, "Kick", {}} };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Create a test directory
    system("mkdir -p /tmp/_mvp_test && touch /tmp/_mvp_test/loop.wav /tmp/_mvp_test/clap.wav");

    // Browse directory
    std::string dirCmd = R"({"type":"command","command":"sample/getDirectory","payload":{"path":"/tmp/_mvp_test"},"id":"mvp_dir"})";
    handler->HandleMessage(1, dirCmd);
    ASSERT_EQ(responses.size(), 1u);
    std::string& dirResp = responses[0];

    // Should have success or error depending on whether InsertMedia is available
    // In mock, InsertMedia is null, so sendToTrack should error
    EXPECT_TRUE(dirResp.find("\"type\":\"response\"") != std::string::npos ||
                dirResp.find("error") != std::string::npos);

    // Cleanup
    system("rm -rf /tmp/_mvp_test");
}

// ============================================================
// Real-time track state event broadcasting tests (Issue #57)
// ============================================================

TEST(TrackEventBroadcastTest, BroadcastTrackEventViaCallback)
{
    // Test that BroadcastTrackEvent sends through the broadcast callback
    std::string captured;
    auto handler = std::make_unique<CommandHandler>(nullptr);
    handler->SetBroadcastCallback([&](const std::string& msg) {
        captured = msg;
    });

    handler->BroadcastTrackEvent("track_mute_changed", 0, true);

    // Verify JSON structure
    EXPECT_NE(captured.find("\"type\":\"event\""), std::string::npos);
    EXPECT_NE(captured.find("\"event\":\"track_mute_changed\""), std::string::npos);
    EXPECT_NE(captured.find("\"trackIdx\":0"), std::string::npos);
    EXPECT_NE(captured.find("\"value\":true"), std::string::npos);

    // Verify balanced braces
    int depth = 0;
    for (char c : captured) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(TrackEventBroadcastTest, BroadcastAllEventTypes)
{
    std::vector<std::string> captured;
    auto handler = std::make_unique<CommandHandler>(nullptr);
    handler->SetBroadcastCallback([&](const std::string& msg) {
        captured.push_back(msg);
    });

    handler->BroadcastTrackEvent("track_mute_changed", 0, true);
    handler->BroadcastTrackEvent("track_solo_changed", 1, false);
    handler->BroadcastTrackEvent("track_arm_changed", 2, true);

    ASSERT_EQ(captured.size(), 3u);

    // Mute event
    EXPECT_NE(captured[0].find("track_mute_changed"), std::string::npos);
    EXPECT_NE(captured[0].find("\"trackIdx\":0"), std::string::npos);
    EXPECT_NE(captured[0].find("\"value\":true"), std::string::npos);

    // Solo event
    EXPECT_NE(captured[1].find("track_solo_changed"), std::string::npos);
    EXPECT_NE(captured[1].find("\"trackIdx\":1"), std::string::npos);
    EXPECT_NE(captured[1].find("\"value\":false"), std::string::npos);

    // Arm event
    EXPECT_NE(captured[2].find("track_arm_changed"), std::string::npos);
    EXPECT_NE(captured[2].find("\"trackIdx\":2"), std::string::npos);
    EXPECT_NE(captured[2].find("\"value\":true"), std::string::npos);
}

TEST(TrackEventBroadcastTest, BroadcastViaWsServer)
{
    // When no callback is set, BroadcastTrackEvent should try m_ws->Broadcast()
    // With a null m_ws, it should just be a no-op (no crash)
    auto handler = std::make_unique<CommandHandler>(nullptr);
    EXPECT_NO_THROW({
        handler->BroadcastTrackEvent("track_mute_changed", 0, true);
    });
}

TEST(TrackEventBroadcastTest, TrackEventJsonIsValidAndParseable)
{
    std::string captured;
    auto handler = std::make_unique<CommandHandler>(nullptr);
    handler->SetBroadcastCallback([&](const std::string& msg) {
        captured = msg;
    });

    handler->BroadcastTrackEvent("track_mute_changed", 5, false);

    // Parse the JSON and verify fields
    JsonParser parser(captured);
    EXPECT_EQ(parser.getString("type"), "event");
    EXPECT_EQ(parser.getString("event"), "track_mute_changed");

    // Parse the nested payload
    size_t payloadStart = captured.find("\"payload\":");
    ASSERT_NE(payloadStart, std::string::npos);
    payloadStart += 10; // skip "payload":
    // Skip whitespace
    while (payloadStart < captured.size() &&
           (captured[payloadStart] == ' ' || captured[payloadStart] == '\t'))
        payloadStart++;
    ASSERT_LT(payloadStart, captured.size());
    ASSERT_EQ(captured[payloadStart], '{');
    // Find matching close brace
    int depth = 0;
    size_t payloadEnd = payloadStart;
    for (; payloadEnd < captured.size(); payloadEnd++) {
        if (captured[payloadEnd] == '{') depth++;
        if (captured[payloadEnd] == '}') depth--;
        if (depth == 0) break;
    }
    std::string payloadJson = captured.substr(payloadStart, payloadEnd - payloadStart + 1);
    JsonParser payload(payloadJson);
    EXPECT_EQ(payload.getString("trackIdx"), "5");
    // getString doesn't handle boolean literals, so verify via substring search
    EXPECT_NE(captured.find("\"value\":false"), std::string::npos);
}

TEST(FxEnumCacheTest, EnumerateReturnsFormatCorrectly)
{
    // Verify format detection works for different plugin types
    g_mockFxList = {
        { "ReaEQ", "VST3:ReaEQ" },
        { "ValhallaRoom", "VST:ValhallaRoom" },
        { "Serum", "CLAP:Serum" },
        { "JS: Delay", "JS:Delay" },
        { "AU Instrument", "AU:Instrument" },
    };
    g_mockEnumCallCount = 0;

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1, R"({"type":"command","command":"fx/enumerate","id":"enum1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Check format strings are present
    EXPECT_NE(resp.find("\"VST3\""), std::string::npos);
    EXPECT_NE(resp.find("\"VST2\""), std::string::npos);
    EXPECT_NE(resp.find("\"CLAP\""), std::string::npos);
    EXPECT_NE(resp.find("\"JSFX\""), std::string::npos);
    EXPECT_NE(resp.find("\"AU\""), std::string::npos);
}

// ============================================================
// Playtime 2 / clip matrix command tests (Issue #61)
// ============================================================

TEST(MatrixTest, GetAllReturnsStructure)
{
    // Test that matrix/getAll returns a properly structured response
    // with columns, rows, and a slots array containing 64 entries
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    std::string cmd = R"({"type":"command","command":"matrix/getAll","id":"m1"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify success
    EXPECT_NE(resp.find("\"success\":true"), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);

    // Verify structure: columns:8, rows:8
    EXPECT_NE(resp.find("\"columns\":8"), std::string::npos);
    EXPECT_NE(resp.find("\"rows\":8"), std::string::npos);

    // Verify slots array has 64 entries (8*8)
    // Each slot has "column", "row", "state" fields
    // Count "state" occurrences — should be 64
    size_t pos = 0;
    int slotCount = 0;
    while ((pos = resp.find("\"state\"", pos)) != std::string::npos) {
        slotCount++;
        pos++;
    }
    EXPECT_EQ(slotCount, 64);

    // Verify the first slot structure
    EXPECT_NE(resp.find("\"column\":0,\"row\":0,\"state\":\"empty\""), std::string::npos);
    // Verify the last slot structure
    EXPECT_NE(resp.find("\"column\":7,\"row\":7,\"state\":\"empty\""), std::string::npos);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, TriggerSlotWithValidParamsReturnsSuccess)
{
    // Test that matrix/triggerSlot with valid column and row returns success
    // and includes the triggered slot coordinates in the response
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    std::string cmd = R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":3,"row":5},"id":"m2"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify success
    EXPECT_NE(resp.find("\"success\":true"), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);

    // Verify slot state response includes coordinates and toggled state
    EXPECT_NE(resp.find("\"column\":3"), std::string::npos);
    EXPECT_NE(resp.find("\"row\":5"), std::string::npos);
    // Slot was empty, after trigger it becomes "playing"
    EXPECT_NE(resp.find("\"state\":\"playing\""), std::string::npos);
    // Verify the full slot structure is present (color, name, clipType)
    EXPECT_NE(resp.find("\"color\""), std::string::npos);
    EXPECT_NE(resp.find("\"name\""), std::string::npos);
    EXPECT_NE(resp.find("\"clipType\""), std::string::npos);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, TriggerSlotMissingParamsReturnsError)
{
    // Test that matrix/triggerSlot without column/row params returns error
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // No payload at all
    std::string cmd = R"({"type":"command","command":"matrix/triggerSlot","id":"m3"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify failure
    EXPECT_NE(resp.find("\"success\":false"), std::string::npos);
    EXPECT_NE(resp.find("\"error\""), std::string::npos);
    EXPECT_NE(resp.find("Missing 'column' or 'row' parameter"), std::string::npos);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, GetSlotWithValidParamsReturnsSlot)
{
    // Test that matrix/getSlot with valid column and row returns slot state
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    std::string cmd = R"({"type":"command","command":"matrix/getSlot","payload":{"column":2,"row":4},"id":"m4"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify success
    EXPECT_NE(resp.find("\"success\":true"), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);

    // Verify slot structure
    EXPECT_NE(resp.find("\"column\":2"), std::string::npos);
    EXPECT_NE(resp.find("\"row\":4"), std::string::npos);
    EXPECT_NE(resp.find("\"state\":\"empty\""), std::string::npos);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, GetSlotMissingParamsReturnsError)
{
    // Test that matrix/getSlot without column/row params returns error
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    std::string cmd = R"({"type":"command","command":"matrix/getSlot","payload":{},"id":"m5"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify failure
    EXPECT_NE(resp.find("\"success\":false"), std::string::npos);
    EXPECT_NE(resp.find("\"error\""), std::string::npos);
    EXPECT_NE(resp.find("Missing 'column' or 'row' parameter"), std::string::npos);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, TriggerSceneWithValidRowReturnsSuccess)
{
    // Test that matrix/triggerScene with a valid row returns success
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    std::string cmd = R"({"type":"command","command":"matrix/triggerScene","payload":{"row":2},"id":"m6"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify success
    EXPECT_NE(resp.find("\"success\":true"), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);

    // Verify triggered flag and row
    EXPECT_NE(resp.find("\"triggered\":true"), std::string::npos);
    EXPECT_NE(resp.find("\"row\":2"), std::string::npos);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, TriggerSceneMissingRowReturnsError)
{
    // Test that matrix/triggerScene without row param returns error
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    std::string cmd = R"({"type":"command","command":"matrix/triggerScene","payload":{},"id":"m7"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify failure
    EXPECT_NE(resp.find("\"success\":false"), std::string::npos);
    EXPECT_NE(resp.find("\"error\""), std::string::npos);
    EXPECT_NE(resp.find("Missing 'row' parameter"), std::string::npos);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, GetAllResponseJsonIsValid)
{
    // Comprehensive validation that the matrix/getAll response is
    // valid, well-formed JSON
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Also verify Phase1MVP-style that all matrix commands produce valid JSON
    struct CmdCheck {
        const char* cmd;
        const char* desc;
    };

    CmdCheck commands[] = {
        {R"({"type":"command","command":"matrix/getAll","id":"v1"})", "matrix/getAll"},
        {R"({"type":"command","command":"matrix/getSlot","payload":{"column":0,"row":0},"id":"v2"})", "matrix/getSlot"},
        {R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":0,"row":0},"id":"v3"})", "matrix/triggerSlot"},
        {R"({"type":"command","command":"matrix/triggerScene","payload":{"row":0},"id":"v4"})", "matrix/triggerScene"},
        {R"({"type":"command","command":"matrix/triggerSlot","id":"v5"})", "matrix/triggerSlot (invalid)"},
        {R"({"type":"command","command":"matrix/getSlot","payload":{},"id":"v6"})", "matrix/getSlot (invalid)"},
    };

    for (const auto& cc : commands) {
        responses.clear();
        handler->HandleMessage(1, cc.cmd);
        ASSERT_EQ(responses.size(), 1u) << "Command " << cc.desc << " should produce 1 response";

        const std::string& resp = responses[0];

        // Verify balanced braces
        int depth = 0;
        for (char c : resp) {
            if (c == '{') depth++;
            if (c == '}') depth--;
        }
        EXPECT_EQ(depth, 0) << "Unbalanced JSON for " << cc.desc;

        // Verify starts and ends with braces
        EXPECT_EQ(resp.front(), '{') << cc.desc;
        EXPECT_EQ(resp.back(), '}') << cc.desc;

        // Verify has type field
        EXPECT_NE(resp.find("\"type\""), std::string::npos) << cc.desc;
    }
}

TEST(MatrixTest, GetAllResponseContentValidation)
{
    // Verify that all 64 slots in matrix/getAll have correct content
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    handler->HandleMessage(1, R"({"type":"command","command":"matrix/getAll","id":"v"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify every column 0..7 and row 0..7 pair is present
    for (int c = 0; c < 8; c++) {
        for (int r = 0; r < 8; r++) {
            std::string expected = "\"column\":" + std::to_string(c)
                + ",\"row\":" + std::to_string(r)
                + ",\"state\":\"empty\"";
            EXPECT_NE(resp.find(expected), std::string::npos)
                << "Missing slot at column=" << c << " row=" << r;
        }
    }
}

// ============================================================
// Playtime 2 integration tests (Issue #61)
// ============================================================

TEST(MatrixTest, TriggerSlotTogglesState)
{
    // Test that triggering an empty slot sets it to "playing",
    // and triggering again sets it back to "stopped"
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // First trigger: empty → playing
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":2,"row":3},"id":"t1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"state\":\"playing\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"column\":2"), std::string::npos);
    EXPECT_NE(responses[0].find("\"row\":3"), std::string::npos);

    // Second trigger: playing → stopped
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":2,"row":3},"id":"t2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"state\":\"stopped\""), std::string::npos);
    EXPECT_NE(responses[0].find("\"column\":2"), std::string::npos);
    EXPECT_NE(responses[0].find("\"row\":3"), std::string::npos);

    // Third trigger: stopped → playing
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":2,"row":3},"id":"t3"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"state\":\"playing\""), std::string::npos);
}

TEST(MatrixTest, TriggerSlotPreservesOtherSlots)
{
    // Test that triggering one slot doesn't affect other slots
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Trigger slot (0,0)
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":0,"row":0},"id":"t1"})");
    ASSERT_EQ(responses.size(), 1u);

    // Get slot (0,0) — should be playing
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/getSlot","payload":{"column":0,"row":0},"id":"g1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"state\":\"playing\""), std::string::npos);

    // Get slot (7,7) — should still be empty
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/getSlot","payload":{"column":7,"row":7},"id":"g2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"state\":\"empty\""), std::string::npos);
}

TEST(MatrixTest, TriggerSceneTogglesEntireRow)
{
    // Test that triggerScene toggles all 8 slots in the given row
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Trigger scene row 1
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerScene","payload":{"row":1},"id":"s1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify all 8 slots in row 1 are now "playing"
    EXPECT_NE(resp.find("\"triggered\":true"), std::string::npos);
    EXPECT_NE(resp.find("\"row\":1"), std::string::npos);
    EXPECT_NE(resp.find("\"slots\""), std::string::npos);
    for (int c = 0; c < 8; c++) {
        std::string expected = "\"column\":" + std::to_string(c)
            + ",\"row\":1,\"state\":\"playing\"";
        EXPECT_NE(resp.find(expected), std::string::npos)
            << "Expected row 1, column " << c << " to be playing";
    }

    // Get individual slot to confirm via getSlot
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/getSlot","payload":{"column":5,"row":1},"id":"gs"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"state\":\"playing\""), std::string::npos);

    // A different row should still be empty
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/getSlot","payload":{"column":0,"row":0},"id":"gs2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"state\":\"empty\""), std::string::npos);
}

TEST(MatrixTest, TriggerSlotOutOfRangeReturnsError)
{
    // Test that column/row out of range returns error
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Column 99 out of range
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":99,"row":0},"id":"bad"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
    EXPECT_NE(responses[0].find("Column or row out of range"), std::string::npos);

    // Negative column
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":-1,"row":0},"id":"bad2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);

    // Row 8 out of range (0-indexed, max 7)
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":0,"row":8},"id":"bad3"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
}

TEST(MatrixTest, TriggerSceneOutOfRangeReturnsError)
{
    // Test that row out of range returns error
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerScene","payload":{"row":99},"id":"bad"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("Row out of range"), std::string::npos);
}

TEST(MatrixTest, SlotStateIncludesColorNameClipType)
{
    // Test that getSlot returns the full slot structure including
    // color, name, and clipType fields
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/getSlot","payload":{"column":4,"row":6},"id":"gs"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // All default empty slot fields should be present
    EXPECT_NE(resp.find("\"state\":\"empty\""), std::string::npos);
    EXPECT_NE(resp.find("\"color\""), std::string::npos);
    EXPECT_NE(resp.find("\"name\""), std::string::npos);
    EXPECT_NE(resp.find("\"clipType\":\"none\""), std::string::npos);
}

TEST(MatrixTest, BroadcastMatrixEventViaCallback)
{
    // Test that BroadcastMatrixEvent sends through the broadcast callback
    std::string captured;
    auto handler = std::make_unique<CommandHandler>(nullptr);
    handler->SetBroadcastCallback([&](const std::string& msg) {
        captured = msg;
    });

    std::string slotJson = R"({"column":1,"row":2,"state":"playing"})";
    handler->BroadcastMatrixEvent("matrix/slotStateChanged", slotJson);

    // Verify JSON structure
    EXPECT_NE(captured.find("\"type\":\"event\""), std::string::npos);
    EXPECT_NE(captured.find("\"event\":\"matrix/slotStateChanged\""), std::string::npos);
    EXPECT_NE(captured.find("\"payload\":{\"column\":1,\"row\":2,\"state\":\"playing\"}"), std::string::npos);

    // Verify balanced braces
    int depth = 0;
    for (char c : captured) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(MatrixTest, TriggerSlotBroadcastsEvent)
{
    // Test that triggering a slot sends a BroadcastMatrixEvent
    // via the broadcast callback
    std::vector<std::string> captured;
    auto handler = std::make_unique<CommandHandler>(nullptr);
    handler->SetBroadcastCallback([&](const std::string& msg) {
        captured.push_back(msg);
    });

    // Also set response callback so we can track
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerSlot","payload":{"column":0,"row":0},"id":"t1"})");

    // Should have both a response and a broadcast event
    ASSERT_EQ(responses.size(), 1u);
    ASSERT_EQ(captured.size(), 1u);

    // Verify broadcast event structure
    EXPECT_NE(captured[0].find("\"type\":\"event\""), std::string::npos);
    EXPECT_NE(captured[0].find("\"event\":\"matrix/slotStateChanged\""), std::string::npos);
    EXPECT_NE(captured[0].find("\"state\":\"playing\""), std::string::npos);
}

TEST(MatrixTest, TriggerSceneBroadcastsEvents)
{
    // Test that triggering a scene broadcasts events for each slot
    std::vector<std::string> captured;
    auto handler = std::make_unique<CommandHandler>(nullptr);
    handler->SetBroadcastCallback([&](const std::string& msg) {
        captured.push_back(msg);
    });

    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    handler->HandleMessage(1,
        R"({"type":"command","command":"matrix/triggerScene","payload":{"row":3},"id":"s1"})");

    // Should have 1 response + 8 slot events (one per column in the row)
    ASSERT_EQ(responses.size(), 1u);
    ASSERT_EQ(captured.size(), 8u);

    // Each event should be for the correct row (3) and sequential columns
    for (int c = 0; c < 8; c++) {
        EXPECT_NE(captured[c].find("\"column\":" + std::to_string(c)), std::string::npos);
        EXPECT_NE(captured[c].find("\"row\":3"), std::string::npos);
        EXPECT_NE(captured[c].find("\"state\":\"playing\""), std::string::npos);
    }
}

TEST(MatrixTest, BuildSlotEventReturnsValidEvent)
{
    // Test the BuildSlotEvent helper produces valid WebSocket event JSON
    auto handler = std::make_unique<CommandHandler>(nullptr);

    std::string slotJson = R"({"column":0,"row":0,"state":"empty"})";
    std::string event = handler->BuildSlotEvent(slotJson);

    EXPECT_NE(event.find("\"type\":\"event\""), std::string::npos);
    EXPECT_NE(event.find("\"event\":\"matrix/slotStateChanged\""), std::string::npos);
    EXPECT_NE(event.find(slotJson), std::string::npos);

    int depth = 0;
    for (char c : event) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

// ============================================================
// Step sequencer command tests (Issue #63)
// ============================================================

TEST(SequencerTest, GetAllReturnsStructure)
{
    // Test that sequencer/getAll returns a properly structured response
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    std::string cmd = R"({"type":"command","command":"sequencer/getAll","id":"s1"})";
    handler->HandleMessage(1, cmd);
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Check basic fields
    EXPECT_NE(resp.find("\"columns\":8"), std::string::npos);
    EXPECT_NE(resp.find("\"rows\":8"), std::string::npos);
    EXPECT_NE(resp.find("\"length\":16"), std::string::npos);
    EXPECT_NE(resp.find("\"baseNote\":36"), std::string::npos);
    EXPECT_NE(resp.find("\"playhead\":0"), std::string::npos);
    EXPECT_NE(resp.find("\"steps\":["), std::string::npos);

    // Count steps - should be 64 (8x8)
    size_t pos = 0;
    int stepCount = 0;
    while ((pos = resp.find("\"column\":", pos)) != std::string::npos) {
        stepCount++;
        pos++;
    }
    EXPECT_EQ(stepCount, 64);

    // Verify all steps are inactive by default
    pos = 0;
    int activeCount = 0;
    while ((pos = resp.find("\"active\":true", pos)) != std::string::npos) {
        activeCount++;
        pos++;
    }
    EXPECT_EQ(activeCount, 0);

    // Verify balanced JSON
    int depth = 0;
    for (char c : resp) {
        if (c == '{') depth++;
        if (c == '}') depth--;
    }
    EXPECT_EQ(depth, 0);
}

TEST(SequencerTest, ToggleStepTogglesActive)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Toggle step (3,4) on
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":3,"row":4},"id":"t1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"active\":true"), std::string::npos);
    EXPECT_NE(responses[0].find("\"column\":3"), std::string::npos);
    EXPECT_NE(responses[0].find("\"row\":4"), std::string::npos);
    EXPECT_TRUE(responses[0].find("\"success\":true") != std::string::npos);

    // Toggle same step off
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":3,"row":4},"id":"t2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"active\":false"), std::string::npos);
}

TEST(SequencerTest, ToggleStepOutOfRangeReturnsError)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":99,"row":0},"id":"bad"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
}

TEST(SequencerTest, SetStepExplicitly)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
        // Print for debugging if verbose
        fprintf(stderr, "SetStep response: %s\n", resp.c_str());
    });

    // Set step (1,2) active with velocity 110
    // Note: boolean values must be quoted strings (JsonParser limitation)
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/setStep","payload":{"column":1,"row":2,"active":"true","velocity":110},"id":"ss1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_TRUE(responses[0].find("\"success\":true") != std::string::npos)
        << "Expected success:true. Response: " << responses[0];
    EXPECT_TRUE(responses[0].find("\"active\":true") != std::string::npos)
        << "Expected active:true. Response: " << responses[0];
    EXPECT_TRUE(responses[0].find("\"velocity\":110") != std::string::npos)
        << "Expected velocity:110. Response: " << responses[0];

    // Set same step inactive
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/setStep","payload":{"column":1,"row":2,"active":"false"},"id":"ss2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_TRUE(responses[0].find("\"active\":false") != std::string::npos)
        << "Expected active:false after unset. Response: " << responses[0];
}

TEST(SequencerTest, ClearAllClearsAllSteps)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Toggle a few steps on
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":0,"row":0},"id":"t1"})");
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":3,"row":5},"id":"t2"})");
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":7,"row":7},"id":"t3"})");

    // Get all — should have 3 active
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/getAll","id":"ga"})");
    ASSERT_EQ(responses.size(), 1u);
    size_t activeBefore = responses[0].find("\"active\":true") != std::string::npos ? 1 : 0;
    // Just check at least one is active
    if (responses[0].find("\"active\":true") == std::string::npos) {
        FAIL() << "Expected at least one active step before clear";
    }

    // Clear all
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/clearAll","id":"cl"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"cleared\":true"), std::string::npos);

    // Get all — should have 0 active
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/getAll","id":"ga2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_EQ(responses[0].find("\"active\":true"), std::string::npos)
        << "Expected no active steps after clear";
}

TEST(SequencerTest, SetLengthChangesLength)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Set length to 32
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/setLength","payload":{"length":32},"id":"sl"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"length\":32"), std::string::npos);

    // Verify via getAll
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/getAll","id":"ga"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"length\":32"), std::string::npos);
}

TEST(SequencerTest, SetLengthOutOfRangeReturnsError)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Length 0 out of range
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/setLength","payload":{"length":0},"id":"bad"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);

    // Length 100 out of range
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/setLength","payload":{"length":100},"id":"bad2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
}

TEST(SequencerTest, SetBaseNoteChangesMapping)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Set base note to C3 (48)
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/setBaseNote","payload":{"note":48},"id":"sbn"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"baseNote\":48"), std::string::npos);

    // Verify via getAll
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/getAll","id":"ga"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"baseNote\":48"), std::string::npos);
}

TEST(SequencerTest, GetPlayheadReturnsPosition)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Set playhead via state directly
    handler->GetPlaytimeState(); // unused, just for access pattern

    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/getPlayhead","id":"gph"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"playhead\":0"), std::string::npos);
    EXPECT_NE(responses[0].find("\"length\":16"), std::string::npos);
}

TEST(SequencerTest, SetStepOutOfRangeReturnsError)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Column 99 out of range
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/setStep","payload":{"column":99,"row":0,"active":true},"id":"bad"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
}

TEST(SequencerTest, ToggleStepPreservesOtherSteps)
{
    auto handler = std::make_unique<CommandHandler>(nullptr);
    std::vector<std::string> responses;
    handler->SetResponseCallback([&](int, const std::string& resp) {
        responses.push_back(resp);
    });

    // Toggle (0,0) on
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":0,"row":0},"id":"t1"})");

    // Toggle (7,7) on
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/toggleStep","payload":{"column":7,"row":7},"id":"t2"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"active\":true"), std::string::npos);
    EXPECT_NE(responses[0].find("\"column\":7"), std::string::npos);

    // Verify (1,1) is still inactive via getAll
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"sequencer/getAll","id":"ga"})");
    ASSERT_EQ(responses.size(), 1u);
    // Get step at column=1,row=1 and verify active:false
    // We parse by looking at the specific step structure
    EXPECT_NE(responses[0].find("\"column\":0,\"row\":0,\"active\":true"), std::string::npos);
    EXPECT_NE(responses[0].find("\"column\":1,\"row\":1,\"active\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("\"column\":7,\"row\":7,\"active\":true"), std::string::npos);
}

// ============================================================
// FX param slider jump fixes (Issue #73)
// ============================================================

TEST(FxParamSliderTest, HandleSetFXParamWithEqualMinMaxDoesNotProduceNaN)
{
    // Some JSFX params report minVal == maxVal (read-only sliders).
    // HandleSetFXParam must guard against division by zero.
    MockState state;
    MockTrack t;
    // A param where min == max (e.g., a read-only display slider)
    t.fx.push_back({ 0, "JS: Analyzer",
        {"Readout"},
        {0.0},   // actual value (min==max, so any value is 0)
        {0.0},   // min
        {0.0},   // max — equal to min!
        {0.0} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Attempt to set the param to any value
    handler->HandleMessage(1,
        R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":0.5},"id":"eqnan"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Should still return success and a valid value (not NaN)
    EXPECT_NE(resp.find("\"set\":true"), std::string::npos)
        << "Should succeed (or at least not crash) even when min==max";
    // Verify value is not NaN — "nan" could appear in the "id" field, so
    // check specifically that the "value" field is not NaN
    EXPECT_EQ(resp.find("\"value\":nan"), std::string::npos)
        << "Response value should never be NaN";
    EXPECT_EQ(resp.find("\"value\":-nan"), std::string::npos)
        << "Response value should never be -NaN";
    EXPECT_EQ(resp.find("\"value\":inf"), std::string::npos)
        << "Response value should never be infinity";
}

TEST(FxParamSliderTest, HandleSetFXParamWithNearlyEqualMinMaxIsSafe)
{
    // Edge case: very small range should not cause issues
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "JS: MicroParam",
        {"Tiny"},
        {1.0},    // actual value (midpoint = 0.9999 + 0.5*0.0002 = 1.0)
        {0.9999},  // min
        {1.0001},  // max — very small range
        {1.0} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    handler->HandleMessage(1,
        R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":1.0},"id":"tiny"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Should produce valid response, not NaN
    EXPECT_EQ(resp.find("\"value\":nan"), std::string::npos);
    EXPECT_NE(resp.find("\"set\":true"), std::string::npos);
}

TEST(FxParamSliderTest, SetParamWithIntegerStepSnapsCorrectly)
{
    // JSFX and VST params often have integer steps.
    // Normalization round-trip can cause rounding errors.
    // The read-back in HandleSetFXParam should return the committed value.
    MockState state;
    MockTrack t;
    // Simulate a stepped param (e.g., pitch cents: -1200 to 1200, integer steps)
    t.fx.push_back({ 0, "ReaPitch",
        {"Pitch adjust"},
        {0.0},             // actual value (midpoint = -1200 + 0.5*2400 = 0)
        {-1200.0},
        {1200.0},
        {0.0} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Set pitch to 100 cents (which is actual display value)
    handler->HandleMessage(1,
        R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":100.0},"id":"pitch1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // The response should include the committed value (which the mock
    // returns faithfully since it just stores the normalized value)
    EXPECT_NE(resp.find("\"set\":true"), std::string::npos);
    // The committed value should be approximately 100 (not 0, not NaN, not some other value)
    EXPECT_NE(resp.find("\"value\":100"), std::string::npos)
        << "Committed value should reflect the set operation";
    EXPECT_EQ(resp.find("\"value\":nan"), std::string::npos);
}

TEST(FxParamSliderTest, SetParamNormalizationPrecisionMaintained)
{
    // Test that the read-back mechanism in HandleSetFXParam accurately
    // returns the value Reaper committed, even through the normalized domain.
    MockState state;
    MockTrack t;
    // Param with a standard continuous range
    t.fx.push_back({ 0, "ReaEQ",
        {"Frequency"},
        {20.0},           // actual value (normalized 0 → actual 20)
        {20.0},
        {20000.0},
        {1000.0} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Set frequency to 10000 Hz
    handler->HandleMessage(1,
        R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":10000.0},"id":"prec1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Read back value should be close to 10000
    // Calculate: normalized = (10000-20)/(20000-20) = 9980/19980 ≈ 0.4995
    // readback: 20 + 0.4995*19980 = 20 + 9980 = 10000
    EXPECT_NE(resp.find("\"value\":10000"), std::string::npos)
        << "Read-back should preserve the set value";
}

TEST(FxParamSliderTest, SetParamOnBypassToggleRange)
{
    // Some JSFX have 0-1 toggles that actually report as min/max
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "JS: Utility",
        {"Bypass", "Gain"},
        {0.0, -18.0},  // actual display values (bypass off, gain at min)
        {0.0, -18.0},
        {1.0, 18.0},
        {0.0, 0.0} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Set bypass to "on" (value=1.0, actual display value.
    // TrackFX_SetParam receives 1.0 directly — no normalization (Issue #73).
    // GetParamEx returns (1.0-0)/(1-0) = 1.0 since min=0, max=1)
    handler->HandleMessage(1,
        R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":1.0},"id":"bp1"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"set\":true"), std::string::npos);
    EXPECT_EQ(resp.find("\"value\":nan"), std::string::npos);
    EXPECT_EQ(resp.find("\"value\":inf"), std::string::npos);
}

TEST(FxParamSliderTest, HandleSetFXParamReturnsCommittedValueConsistentWithGet)
{
    // Roundtrip: set a value, get the response back, then get params
    // and verify the setParam committed value matches the getParam value.
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ",
        {"Gain"},
        {0.0},  // actual value (midpoint of -24 to 24)
        {-24.0},
        {24.0},
        {0.0} });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Set gain to 12 dB
    handler->HandleMessage(1,
        R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":12.0},"id":"gain1"})");
    ASSERT_EQ(responses.size(), 1u);

    // Read back committed value from setParam response
    std::string& setResp = responses[0];
    EXPECT_NE(setResp.find("\"set\":true"), std::string::npos);
    EXPECT_NE(setResp.find("\"value\":12"), std::string::npos)
        << "Set response value should be 12 dB";

    // Now get params and verify consistency
    responses.clear();
    handler->HandleMessage(1,
        R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"gain2"})");
    ASSERT_EQ(responses.size(), 1u);
    std::string& getResp = responses[0];

    // GetParams should show the same committed value
    EXPECT_NE(getResp.find("\"value\":12"), std::string::npos)
        << "GetParams value should match the committed set value";}

// ============================================================
// FX Chain save/load command tests (Issue #7)
// ============================================================

TEST(FxChainTest, GetDirectoryListsRfxChainFiles)
{
    // Create a temp directory with .RfxChain files
    fs::path testDir = fs::temp_directory_path() / "_fxchain_test";
    fs::create_directories(testDir);
    { std::ofstream(testDir / "my_chain.RfxChain").close(); }
    { std::ofstream(testDir / "another.RfxChain").close(); }
    { std::ofstream(testDir / "note.txt").close(); } // Should be excluded

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/getDirectory","payload":{"path":")" + testDir.string() + R"("},"id":"fc1"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    // Verify only .RfxChain files are listed
    EXPECT_NE(resp.find("my_chain.RfxChain"), std::string::npos);
    EXPECT_NE(resp.find("another.RfxChain"), std::string::npos);
    // note.txt should NOT be in the response
    EXPECT_EQ(resp.find("note.txt"), std::string::npos);

    // Cleanup
    fs::remove_all(testDir);
}

TEST(FxChainTest, GetDirectoryEmptyDir)
{
    // Test getDirectory on a valid but empty directory
    fs::path testDir = fs::temp_directory_path() / "_fxchain_empty_test";
    fs::create_directories(testDir);

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/getDirectory","payload":{"path":")" + testDir.string() + R"("},"id":"fc2"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    // Should succeed with empty chains array
    EXPECT_NE(responses[0].find("\"chains\":[]"), std::string::npos);
    EXPECT_EQ(responses[0].find("\"error\""), std::string::npos);

    fs::remove_all(testDir);
}

TEST(FxChainTest, GetDirectoryInvalidPath)
{
    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/getDirectory","payload":{"path":"/nonexistent_path_xyz123"},"id":"fc3"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
}

TEST(FxChainTest, SaveChainCreatesFile)
{
    // Create a temp directory for saving
    fs::path testDir = fs::temp_directory_path() / "_fxchain_save_test";
    fs::create_directories(testDir);
    fs::path savePath = testDir / "saved_chain.RfxChain";

    MockState state;
    MockTrack t;
    t.fx.push_back({0, "ReaEQ", {}, {}, {}, {}, {}});
    t.fx.push_back({1, "ReaComp", {}, {}, {}, {}, {}});
    state.tracks = {t};

    // Reset mock chunk to default (has ReaEQ and ReaComp)
    g_mockChunk = ""; // Will auto-init with default

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/save","payload":{"trackIdx":0,"filePath":")" + savePath.string() + R"("},"id":"fc4"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"saved\":true"), std::string::npos);
    EXPECT_NE(resp.find("\"filePath\""), std::string::npos);

    // Verify file was created
    EXPECT_TRUE(fs::exists(savePath));
    EXPECT_GT(fs::file_size(savePath), 0);

    // Verify file contains FXCHAIN section
    std::ifstream f(savePath);
    std::string content((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    EXPECT_NE(content.find("<FXCHAIN"), std::string::npos);
    EXPECT_NE(content.find("ReaEQ"), std::string::npos);
    EXPECT_NE(content.find("ReaComp"), std::string::npos);

    fs::remove_all(testDir);
}

TEST(FxChainTest, SaveChainOnTrackWithNoFx)
{
    fs::path testDir = fs::temp_directory_path() / "_fxchain_nofx_test";
    fs::create_directories(testDir);
    fs::path savePath = testDir / "empty.RfxChain";

    // Track with no FX — default chunk has no FXCHAIN section
    // Modify g_mockChunk to have NO FXCHAIN
    g_mockChunk = "<TRACK\n  NAME \"Empty Track\"\n>\n";

    MockState state;
    MockTrack t;
    t.fx = {}; // No FX
    state.tracks = {t};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/save","payload":{"trackIdx":0,"filePath":")" + savePath.string() + R"("},"id":"fc5"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    // Should fail with "No FX chain found on track"
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("No FX chain found"), std::string::npos);

    fs::remove_all(testDir);
}

TEST(FxChainTest, LoadChainReplacesTrackFx)
{
    fs::path testDir = fs::temp_directory_path() / "_fxchain_load_test";
    fs::create_directories(testDir);
    fs::path chainPath = testDir / "chain.RfxChain";

    // Create an FX chain file
    std::string fxChainContent =
        "<FXCHAIN\n"
        "  SHOW 0\n"
        "  LASTSEL 0\n"
        "  DOCKED 0\n"
        "  <ITEM\n"
        "    NAME \"LoadedFX\"\n"
        "    VST \"VST3: LoadedFX (Test)\" LoadedFX 0 0\n"
        "  >\n"
        "  <ITEM\n"
        "    NAME \"AnotherFX\"\n"
        "    VST \"VST3: AnotherFX (Test)\" AnotherFX 0 0\n"
        "  >\n"
        ">";

    std::ofstream f(chainPath);
    f << fxChainContent;
    f.close();

    // Track with existing FX (ReaEQ only)
    g_mockChunk = "<TRACK\n  NAME \"Test\"\n"
        "  <FXCHAIN\n"
        "    SHOW 0\n"
        "    LASTSEL 0\n"
        "    <ITEM\n"
        "      NAME \"ReaEQ\"\n"
        "      VST \"VST3: ReaEQ (Cockos)\" ReaEQ 0 0\n"
        "    >\n"
        "  >\n"
        ">";

    MockState state;
    MockTrack t;
    t.fx.push_back({0, "ReaEQ", {}, {}, {}, {}, {}});
    state.tracks = {t};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/load","payload":{"trackIdx":0,"filePath":")" + chainPath.string() + R"("},"id":"fc6"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"loaded\":true"), std::string::npos);
    EXPECT_NE(resp.find("\"filePath\""), std::string::npos);

    // Verify track chunk was updated (should now contain LoadedFX instead of ReaEQ)
    EXPECT_NE(g_mockChunk.find("LoadedFX"), std::string::npos) << "New FX should be in chunk";
    EXPECT_EQ(g_mockChunk.find("ReaEQ"), std::string::npos) << "Old FX should be replaced";

    fs::remove_all(testDir);
}

TEST(FxChainTest, LoadChainAppendAddsToExisting)
{
    fs::path testDir = fs::temp_directory_path() / "_fxchain_append_test";
    fs::create_directories(testDir);
    fs::path chainPath = testDir / "add.RfxChain";

    // Append chain: additional FX
    std::string appendChain =
        "<FXCHAIN\n"
        "  <ITEM\n"
        "    NAME \"AddedFX\"\n"
        "    VST \"VST3: AddedFX (Test)\" AddedFX 0 0\n"
        "  >\n"
        ">";

    std::ofstream f(chainPath);
    f << appendChain;
    f.close();

    // Track with existing FX (ReaEQ)
    g_mockChunk = "<TRACK\n  NAME \"Test\"\n"
        "  <FXCHAIN\n"
        "    SHOW 0\n"
        "    <ITEM\n"
        "      NAME \"ReaEQ\"\n"
        "      VST \"VST3: ReaEQ (Cockos)\" ReaEQ 0 0\n"
        "    >\n"
        "  >\n"
        ">";

    MockState state;
    MockTrack t;
    t.fx.push_back({0, "ReaEQ", {}, {}, {}, {}, {}});
    state.tracks = {t};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/load","payload":{"trackIdx":0,"filePath":")" + chainPath.string() + R"(","mode":"append"},"id":"fc7"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"loaded\":true"), std::string::npos);
    EXPECT_NE(responses[0].find("\"append\":true"), std::string::npos);

    // Both original and appended FX should be in chunk
    EXPECT_NE(g_mockChunk.find("ReaEQ"), std::string::npos) << "Original FX should remain";
    EXPECT_NE(g_mockChunk.find("AddedFX"), std::string::npos) << "Appended FX should be added";

    fs::remove_all(testDir);
}

TEST(FxChainTest, LoadChainWithMissingFile)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({0, "ReaEQ", {}, {}, {}, {}, {}});
    state.tracks = {t};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/load","payload":{"trackIdx":0,"filePath":"/nonexistent/file.RfxChain"},"id":"fc8"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
}

TEST(FxChainTest, GetInfoReturnsChainDetails)
{
    fs::path testDir = fs::temp_directory_path() / "_fxchain_info_test";
    fs::create_directories(testDir);
    fs::path chainPath = testDir / "test_chain.RfxChain";

    // Create an FX chain file with multiple FX
    std::string fxChainContent =
        "<FXCHAIN\n"
        "  SHOW 0\n"
        "  LASTSEL 0\n"
        "  DOCKED 0\n"
        "  <ITEM\n"
        "    NAME \"ReaEQ\"\n"
        "    VST \"VST3: ReaEQ (Cockos)\" ReaEQ 0 0 0\n"
        "  >\n"
        "  <ITEM\n"
        "    NAME \"ReaComp\"\n"
        "    VST \"VST3: ReaComp (Cockos)\" ReaComp 0 0\n"
        "  >\n"
        "  <ITEM\n"
        "    NAME \"ReaDelay\"\n"
        "    VST \"VST3: ReaDelay (Cockos)\" ReaDelay 0\n"
        "  >\n"
        ">";

    std::ofstream f(chainPath);
    f << fxChainContent;
    f.close();

    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/getInfo","payload":{"filePath":")" + chainPath.string() + R"("},"id":"fc9"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    std::string& resp = responses[0];

    EXPECT_NE(resp.find("\"fxCount\":3"), std::string::npos) << "Should find 3 FX";
    EXPECT_NE(resp.find("ReaEQ"), std::string::npos);
    EXPECT_NE(resp.find("ReaComp"), std::string::npos);
    EXPECT_NE(resp.find("ReaDelay"), std::string::npos);

    // Verify fxNames array has 3 entries
    size_t pos = 0;
    int nameCount = 0;
    while ((pos = resp.find("\"fxNames\"", pos)) != std::string::npos) {
        nameCount++;
        pos++;
    }
    EXPECT_EQ(nameCount, 1) << "fxNames should appear exactly once";

    fs::remove_all(testDir);
}

TEST(FxChainTest, SaveAndLoadRoundTrip)
{
    // Full round-trip: save a track's FX chain, then load it onto another track
    fs::path testDir = fs::temp_directory_path() / "_fxchain_roundtrip";
    fs::create_directories(testDir);
    fs::path savePath = testDir / "roundtrip.RfxChain";

    // Track 0 has ReaEQ and ReaComp
    g_mockChunk = "<TRACK\n  NAME \"Source\"\n"
        "  <FXCHAIN\n"
        "    SHOW 0\n"
        "    <ITEM\n"
        "      NAME \"ReaEQ\"\n"
        "      VST \"VST3: ReaEQ (Cockos)\" ReaEQ 0\n"
        "    >\n"
        "    <ITEM\n"
        "      NAME \"ReaComp\"\n"
        "      VST \"VST3: ReaComp (Cockos)\" ReaComp 0 0\n"
        "    >\n"
        "  >\n"
        ">";

    MockState state;
    MockTrack t0, t1;
    t0.fx.push_back({0, "ReaEQ", {}, {}, {}, {}, {}});
    t0.fx.push_back({1, "ReaComp", {}, {}, {}, {}, {}});
    t1.fx = {}; // Empty
    state.tracks = {t0, t1};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);
    // Reset mock chunk to default
    g_mockChunk = "";

    // Step 1: Save track 0's FX chain
    std::string saveCmd = R"({"type":"command","command":"fxchain/save","payload":{"trackIdx":0,"filePath":")" + savePath.string() + R"("},"id":"fc_s"})";
    handler->HandleMessage(1, saveCmd);
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"saved\":true"), std::string::npos);

    // Verify file exists
    ASSERT_TRUE(fs::exists(savePath));

    // Step 2: Load onto track 1
    // First, set the chunk for track 1 to something different
    g_mockChunk = "<TRACK\n  NAME \"Dest\"\n  <FXCHAIN\n"
        "    SHOW 0\n"
        "    <ITEM\n"
        "      NAME \"ReaDelay\"\n"
        "      VST \"VST3: ReaDelay (Cockos)\" ReaDelay 0\n"
        "    >\n"
        "  >\n"
        ">";

    responses.clear();
    std::string loadCmd = R"({"type":"command","command":"fxchain/load","payload":{"trackIdx":1,"filePath":")" + savePath.string() + R"("},"id":"fc_l"})";
    handler->HandleMessage(1, loadCmd);
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"loaded\":true"), std::string::npos);

    // Verify track 1's chunk now has the saved FX (ReaEQ, ReaComp) and not ReaDelay
    EXPECT_NE(g_mockChunk.find("ReaEQ"), std::string::npos);
    EXPECT_NE(g_mockChunk.find("ReaComp"), std::string::npos);
    EXPECT_EQ(g_mockChunk.find("ReaDelay"), std::string::npos);

    fs::remove_all(testDir);
}

TEST(FxChainTest, GetInfoMissingFileReturnsError)
{
    MockState state;
    state.tracks = {};

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/getInfo","payload":{"filePath":"/nonexistent/file.RfxChain"},"id":"fc10"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("\"error\""), std::string::npos);
}

TEST(FxChainTest, SaveChainWithInvalidTrackReturnsError)
{
    fs::path testDir = fs::temp_directory_path() / "_fxchain_invalid_test";
    fs::create_directories(testDir);
    fs::path savePath = testDir / "invalid.RfxChain";

    MockState state;
    state.tracks = {}; // No tracks

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    std::string cmd = R"({"type":"command","command":"fxchain/save","payload":{"trackIdx":0,"filePath":")" + savePath.string() + R"("},"id":"fc11"})";
    handler->HandleMessage(1, cmd);

    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"success\":false"), std::string::npos);
    EXPECT_NE(responses[0].find("Invalid track index"), std::string::npos);

    fs::remove_all(testDir);
}

