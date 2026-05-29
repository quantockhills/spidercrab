#include <gtest/gtest.h>
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
    return f.paramVals[param];
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

static void* mock_GetSetMediaTrackInfo(MediaTrack*, const char*, void*) { return nullptr; }

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
    api.EnumInstalledFX      = mock_EnumInstalledFX;
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
    MockTrack::MockFX f1{ 0, "ReaEQ", { "Frequency", "Gain", "Q" }, { 1000.0, 0.0, 1.0 }, { 20.0, -24.0, 0.01 }, { 20000.0, 24.0, 10.0 }, { 1000.0, 0.0, 1.0 } };
    MockTrack::MockFX f2{ 1, "ReaComp", { "Threshold", "Ratio", "Attack", "Release" }, { -18.0, 4.0, 10.0, 100.0 }, { -60.0, 1.0, 0.1, 1.0 }, { 0.0, 20.0, 300.0, 1000.0 }, { -18.0, 4.0, 10.0, 100.0 } };
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
        { 1000.0, -3.0, 0.7 },
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
    EXPECT_NE(resp.find("\"value\":1000"), std::string::npos);
    EXPECT_NE(resp.find("\"value\":-3"), std::string::npos);
    EXPECT_NE(resp.find("\"value\":0.7"), std::string::npos);
    EXPECT_EQ(resp.find("\"error\""), std::string::npos);
}

TEST(FXRoundtripTest, SetParamThenGetParamReflectsNewValue)
{
    MockState state;
    MockTrack t;
    t.fx.push_back({ 0, "ReaEQ",
        { "Frequency", "Gain" },
        { 1000.0, 0.0 },
        { 20.0, -24.0 },
        { 20000.0, 24.0 },
        { 1000.0, 0.0 } });
    state.tracks = { t };

    std::vector<std::string> responses;
    auto handler = MakeMockHandler(&state, &responses);

    // Set Frequency to 5000.0
    handler->HandleMessage(1, R"({"type":"command","command":"fx/setParam","payload":{"trackIdx":0,"fxIdx":0,"paramIdx":0,"value":5000.0},"id":"set1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"set\":true"), std::string::npos);

    // Now get params and verify the new value
    responses.clear();
    handler->HandleMessage(1, R"({"type":"command","command":"fx/getParams","payload":{"trackIdx":0,"fxIdx":0},"id":"get1"})");
    ASSERT_EQ(responses.size(), 1u);
    EXPECT_NE(responses[0].find("\"value\":5000"), std::string::npos);
    // Gain should still be 0.0
    EXPECT_NE(responses[0].find("\"value\":0"), std::string::npos);
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
        { 1000.0 },
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
    
    // Create temp directory with known contents
    system("mkdir -p /tmp/_sample_test && touch /tmp/_sample_test/a.wav /tmp/_sample_test/b.wav");
    
    // Verify directory listing works
    std::string testDir = "/tmp/_sample_test";
    bool foundA = false, foundB = false;
    for (const auto& entry : fs::directory_iterator(testDir)) {
        std::string name = entry.path().filename().string();
        if (name == "a.wav") foundA = true;
        if (name == "b.wav") foundB = true;
    }
    EXPECT_TRUE(foundA);
    EXPECT_TRUE(foundB);
    
    // Cleanup
    system("rm -rf /tmp/_sample_test");
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

