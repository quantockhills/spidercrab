#pragma once

#include <string>
#include <vector>
#include <cmath>

// ── SlicePoint ───────────────────────────────────────────────

struct SlicePoint {
    double startTime;   // onset time in seconds
    double endTime;     // next onset or file end
    double duration;    // slice duration in seconds
    int    index;       // slice index
    std::string label;  // human-readable label (e.g. "Slice 0", "Kick")

    std::string ToJson() const;
};

// ── Slicer ───────────────────────────────────────────────────

class Slicer {
public:
    Slicer() = default;

    // Analyze audio data and return slice points.
    // data: interleaved float samples (range [-1.0, 1.0])
    // numSamples: total number of samples across all channels
    // sampleRate: sample rate in Hz
    // numChannels: channel count
    // sensitivity: 0.0–1.0 (lower = more slices, higher = fewer)
    std::vector<SlicePoint> DetectTransients(
        const float* data, size_t numSamples,
        int sampleRate, int numChannels,
        double sensitivity = 0.5);

    // Convenience: detect transients from a file path.
    // Reads audio from a PCM_source, detects onsets, returns slice points.
    // Requires externally-provided function pointers for REAPER APIs.
    std::vector<SlicePoint> DetectFromFile(
        const std::string& filePath,
        double sensitivity = 0.5);

    // Static: create a human-readable label for a slice
    static std::string LabelForSlice(int index, double startTime, double duration);

private:
    // Compute frame energy for a block of samples (RMS)
    static double ComputeFrameEnergy(const float* samples, size_t count);

    // Compute spectral flux proxy: difference in RMS energy between consecutive frames
    static std::vector<double> ComputeEnergyFlux(
        const float* data, size_t numSamples,
        int sampleRate, int numChannels,
        int frameSize);

    // Adaptive threshold from onset detection function
    static double ComputeThreshold(
        const std::vector<double>& detectionFn,
        double sensitivity);

    // Find peaks in detection function above threshold
    static std::vector<int> FindPeaks(
        const std::vector<double>& detectionFn,
        double threshold,
        int minDistance);
};

// ── Inline helpers ───────────────────────────────────────────

inline std::string SlicePoint::ToJson() const
{
    char buf[256];
    snprintf(buf, sizeof(buf),
        "{\"index\":%d,\"startTime\":%.4f,\"endTime\":%.4f,\"duration\":%.4f,\"label\":\"%s\"}",
        index, startTime, endTime, duration, label.c_str());
    return std::string(buf);
}

inline std::string Slicer::LabelForSlice(int index, double startTime, double duration)
{
    char buf[64];
    snprintf(buf, sizeof(buf), "Slice %d", index);
    return std::string(buf);
}
