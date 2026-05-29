#include <gtest/gtest.h>
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
