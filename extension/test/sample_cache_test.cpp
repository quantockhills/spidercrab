#include <gtest/gtest.h>
#include <fstream>
#include <filesystem>
#include <cstdio>
#include <cstring>
#include <thread>
#include <atomic>

// Include the source directly (same pattern as test_command_handler.cpp)
#include "../src/sample_cache.cpp"

namespace fs = std::filesystem;

// ============================================================
// Test fixture: creates a temporary directory with sample files
// ============================================================
class SampleCacheTest : public ::testing::Test {
protected:
    fs::path tempDir;

    void SetUp() override
    {
        // Create unique temp directory
        tempDir = fs::temp_directory_path() / "spidercrab_sample_test_XXXXXX";
        // Make it unique
        tempDir += std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
        fs::create_directories(tempDir);

        // Create some audio files
        createFile(tempDir / "kick.wav", 10240);
        createFile(tempDir / "snare.wav", 20480);
        createFile(tempDir / "bass.mp3", 50120);
        createFile(tempDir / "melody.flac", 100000);

        // Create a non-audio file (should be ignored)
        createFile(tempDir / "notes.txt", 100);

        // Create subdirectories with audio files
        fs::create_directories(tempDir / "loops");
        createFile(tempDir / "loops" / "groove1.wav", 32000);
        createFile(tempDir / "loops" / "groove2.ogg", 28000);
        createFile(tempDir / "loops" / "readme.txt", 50);

        fs::create_directories(tempDir / "oneshots");
        createFile(tempDir / "oneshots" / "clap.wav", 8192);
        createFile(tempDir / "oneshots" / "hat.aiff", 6144);

        // Nested subdirectory
        fs::create_directories(tempDir / "loops" / "sub");
        createFile(tempDir / "loops" / "sub" / "deep.wav", 16000);
    }

    void TearDown() override
    {
        fs::remove_all(tempDir);
    }

    void createFile(const fs::path& path, size_t size)
    {
        std::ofstream ofs(path, std::ios::binary);
        std::string data(size, 'X');
        ofs.write(data.data(), data.size());
    }
};

// ============================================================
// IsAudioExtension tests
// ============================================================

TEST(IsAudioExtensionTest, RecognizesWav)
{
    EXPECT_TRUE(IsAudioExtension("kick.wav"));
    EXPECT_TRUE(IsAudioExtension("path/to/sound.WAV"));
    EXPECT_TRUE(IsAudioExtension("UPPERCASE.WAV"));
}

TEST(IsAudioExtensionTest, RecognizesMp3)
{
    EXPECT_TRUE(IsAudioExtension("song.mp3"));
    EXPECT_TRUE(IsAudioExtension("Song.MP3"));
}

TEST(IsAudioExtensionTest, RecognizesFlac)
{
    EXPECT_TRUE(IsAudioExtension("track.flac"));
    EXPECT_TRUE(IsAudioExtension("Track.FLAC"));
}

TEST(IsAudioExtensionTest, RecognizesOgg)
{
    EXPECT_TRUE(IsAudioExtension("sound.ogg"));
}

TEST(IsAudioExtensionTest, RecognizesAiff)
{
    EXPECT_TRUE(IsAudioExtension("sample.aiff"));
    EXPECT_TRUE(IsAudioExtension("sample.aif"));
}

TEST(IsAudioExtensionTest, RecognizesM4a)
{
    EXPECT_TRUE(IsAudioExtension("song.m4a"));
}

TEST(IsAudioExtensionTest, RecognizesWma)
{
    EXPECT_TRUE(IsAudioExtension("audio.wma"));
}

TEST(IsAudioExtensionTest, RejectsNonAudio)
{
    EXPECT_FALSE(IsAudioExtension("notes.txt"));
    EXPECT_FALSE(IsAudioExtension("image.png"));
    EXPECT_FALSE(IsAudioExtension("script.js"));
    EXPECT_FALSE(IsAudioExtension("archive.zip"));
    EXPECT_FALSE(IsAudioExtension("Makefile"));
    EXPECT_FALSE(IsAudioExtension(".hidden"));
}

// ============================================================
// SampleCache tests
// ============================================================

TEST_F(SampleCacheTest, BuildIndexScansAllAudioFiles)
{
    SampleCache cache;
    bool ok = cache.BuildIndex(tempDir.string());
    EXPECT_TRUE(ok);
    EXPECT_TRUE(cache.IsIndexed());
    EXPECT_EQ(cache.GetTotalFiles(), 7); // 7 audio files across all dirs
}

TEST_F(SampleCacheTest, BuildIndexFailsOnInvalidPath)
{
    SampleCache cache;
    bool ok = cache.BuildIndex("/nonexistent/path/that/does/not/exist");
    EXPECT_FALSE(ok);
    EXPECT_FALSE(cache.IsIndexed());
}

TEST_F(SampleCacheTest, BuildIndexFailsOnEmptyPath)
{
    SampleCache cache;
    bool ok = cache.BuildIndex("");
    EXPECT_FALSE(ok);
    EXPECT_FALSE(cache.IsIndexed());
}

TEST_F(SampleCacheTest, GetDirectoryReturnsRootLevelItems)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());

    auto entries = cache.GetDirectory("");
    EXPECT_GT(entries.size(), 0);

    // Should have directories: loops, oneshots
    bool foundLoops = false;
    bool foundOneshots = false;
    for (const auto& e : entries) {
        if (e.name == "loops" && e.type == "dir")
            foundLoops = true;
        if (e.name == "oneshots" && e.type == "dir")
            foundOneshots = true;
    }
    EXPECT_TRUE(foundLoops);
    EXPECT_TRUE(foundOneshots);

    // Should have root-level audio files (kick.wav, snare.wav, bass.mp3, melody.flac)
    int rootFiles = 0;
    for (const auto& e : entries) {
        if (e.type == "file")
            rootFiles++;
    }
    EXPECT_EQ(rootFiles, 4); // kick.wav, snare.wav, bass.mp3, melody.flac
}

TEST_F(SampleCacheTest, GetDirectoryWithPath)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());

    // Look inside "loops" directory
    auto entries = cache.GetDirectory("loops");
    EXPECT_GT(entries.size(), 0);

    bool foundGroove1 = false;
    bool foundGroove2 = false;
    bool foundSub = false;
    for (const auto& e : entries) {
        if (e.name.find("groove1") != std::string::npos || e.name == "groove1.wav")
            foundGroove1 = true;
        if (e.name.find("groove2") != std::string::npos || e.name == "groove2.ogg")
            foundGroove2 = true;
        if (e.name == "sub" && e.type == "dir")
            foundSub = true;
    }
    EXPECT_TRUE(foundGroove1);
    EXPECT_TRUE(foundGroove2);
    EXPECT_TRUE(foundSub);
}

TEST_F(SampleCacheTest, GetDirectoryWithOffsetAndLimit)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());

    auto allEntries = cache.GetDirectory("", 0, 0);
    ASSERT_GT(allEntries.size(), 0);

    // Apply pagination
    auto paged = cache.GetDirectory("", 1, 2);
    EXPECT_LE(paged.size(), 2);

    // The first entry (skipped) and next two
    if (allEntries.size() > 1 && paged.size() > 0) {
        EXPECT_EQ(paged[0].name, allEntries[1].name);
    }
}

TEST_F(SampleCacheTest, ClearResetsCache)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());
    EXPECT_TRUE(cache.IsIndexed());
    EXPECT_GT(cache.GetTotalFiles(), 0);

    cache.Clear();
    EXPECT_FALSE(cache.IsIndexed());
    EXPECT_EQ(cache.GetTotalFiles(), 0);

    auto entries = cache.GetDirectory("");
    EXPECT_TRUE(entries.empty());
}

TEST_F(SampleCacheTest, RefreshReindexes)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());
    int beforeCount = cache.GetTotalFiles();
    EXPECT_GT(beforeCount, 0);

    // Add a new audio file
    createFile(tempDir / "newloop.wav", 5000);

    // Refresh
    bool ok = cache.Refresh();
    EXPECT_TRUE(ok);
    EXPECT_EQ(cache.GetTotalFiles(), beforeCount + 1);
}

TEST_F(SampleCacheTest, BuildIndexReportsProgress)
{
    SampleCache cache;
    int lastScanned = 0;
    int lastTotal = 0;
    std::string lastStatus;

    auto progressCb = [&](int scanned, int total, const std::string& status) {
        lastScanned = scanned;
        lastTotal = total;
        lastStatus = status;
    };

    bool ok = cache.BuildIndex(tempDir.string(), progressCb);
    EXPECT_TRUE(ok);

    // Final progress should show completion
    EXPECT_EQ(lastStatus, "complete");
    EXPECT_EQ(lastScanned, 7);
    EXPECT_GE(lastTotal, 7);
}

TEST_F(SampleCacheTest, ReIndexIsEquivalentToRefresh)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());
    int beforeCount = cache.GetTotalFiles();
    EXPECT_GT(beforeCount, 0);

    createFile(tempDir / "extra.aif", 3000);
    createFile(tempDir / "extra2.m4a", 4000);

    bool ok = cache.ReIndex();
    EXPECT_TRUE(ok);
    EXPECT_EQ(cache.GetTotalFiles(), beforeCount + 2);
}

TEST_F(SampleCacheTest, GetDirectoryExcludesNonAudioFiles)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());

    auto entries = cache.GetDirectory("");
    for (const auto& e : entries) {
        if (e.type == "file") {
            // All files should be audio files
            EXPECT_TRUE(IsAudioExtension(e.name));
        }
    }
}

TEST_F(SampleCacheTest, GetRootPath)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());
    EXPECT_EQ(cache.GetRootPath(), tempDir.string());
}

// ============================================================
// Thread safety test (basic — verify no crash under contention)
// ============================================================

TEST_F(SampleCacheTest, ConcurrentAccess)
{
    SampleCache cache;
    cache.BuildIndex(tempDir.string());

    std::atomic<bool> done{false};
    std::thread reader([&]() {
        while (!done) {
            auto entries = cache.GetDirectory("");
            (void)entries;
            std::this_thread::yield();
        }
    });

    // While reader is running, refresh
    createFile(tempDir / "concurrent_test.wav", 12345);
    cache.Refresh();

    done = true;
    reader.join();

    EXPECT_TRUE(cache.IsIndexed());
    EXPECT_GE(cache.GetTotalFiles(), 8);
}
