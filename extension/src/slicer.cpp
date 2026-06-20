#include "slicer.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
#include <numeric>
#include <vector>

// ============================================================
// Slicer: Transient-Based Sample Slicer
// ============================================================

// ── Frame-level energy (RMS) ────────────────────────────────

double Slicer::ComputeFrameEnergy(const float* samples, size_t count)
{
    if (count == 0) return 0.0;
    double sumSq = 0.0;
    for (size_t i = 0; i < count; ++i) {
        sumSq += static_cast<double>(samples[i]) * static_cast<double>(samples[i]);
    }
    return std::sqrt(sumSq / static_cast<double>(count));
}

// ── Energy flux (proxy for spectral flux) ───────────────────

std::vector<double> Slicer::ComputeEnergyFlux(
    const float* data, size_t numSamples,
    int sampleRate, int numChannels,
    int frameSize)
{
    if (!data || numSamples == 0 || sampleRate <= 0 || numChannels <= 0 || frameSize <= 0) {
        return {};
    }

    // Number of frames (hop size = frameSize for simplicity)
    // Use 50% overlap for better time resolution
    int hopSize = frameSize / 2;
    size_t numFrames = (numSamples / numChannels >= static_cast<size_t>(hopSize))
        ? ((numSamples / numChannels - frameSize) / hopSize) + 1
        : 0;

    if (numFrames == 0) return {};

    std::vector<double> frameEnergies;
    frameEnergies.reserve(numFrames);

    for (size_t f = 0; f < numFrames; ++f) {
        size_t startSample = f * hopSize * numChannels;
        if (startSample + frameSize * static_cast<size_t>(numChannels) > numSamples)
            break;

        // Average energy across channels in this frame
        double frameEnergy = 0.0;
        size_t channelSampleCount = 0;

        // Sum energy across all channels within frame
        for (int c = 0; c < numChannels; ++c) {
            size_t chStart = startSample + c;
            size_t count = 0;
            double chSumSq = 0.0;
            for (size_t i = chStart;
                 i < numSamples && count < static_cast<size_t>(frameSize);
                 i += numChannels, ++count)
            {
                double s = static_cast<double>(data[i]);
                chSumSq += s * s;
            }
            if (count > 0) {
                frameEnergy += std::sqrt(chSumSq / static_cast<double>(count));
                channelSampleCount++;
            }
        }

        if (channelSampleCount > 0) {
            frameEnergies.push_back(frameEnergy / static_cast<double>(channelSampleCount));
        } else {
            frameEnergies.push_back(0.0);
        }
    }

    if (frameEnergies.size() < 2) return {};

    // Compute flux: half-wave rectified difference of frame energies
    std::vector<double> flux(frameEnergies.size(), 0.0);
    for (size_t i = 1; i < frameEnergies.size(); ++i) {
        double diff = frameEnergies[i] - frameEnergies[i - 1];
        // Half-wave rectification — only positive jumps (onsets)
        flux[i] = (diff > 0.0) ? diff : 0.0;
    }

    return flux;
}

// ── Adaptive threshold ──────────────────────────────────────

double Slicer::ComputeThreshold(
    const std::vector<double>& detectionFn,
    double sensitivity)
{
    if (detectionFn.empty()) return 0.0;

    // Compute mean and standard deviation of the detection function
    double sum = std::accumulate(detectionFn.begin(), detectionFn.end(), 0.0);
    double mean = sum / static_cast<double>(detectionFn.size());

    double sqSum = 0.0;
    for (double v : detectionFn) {
        double d = v - mean;
        sqSum += d * d;
    }
    double stddev = std::sqrt(sqSum / static_cast<double>(detectionFn.size()));

    // Sensitivity maps to multiplier: 0.0 (max sensitive) → 1σ, 1.0 (min sensitive) → 5σ
    // Default 0.5 → 3σ
    double multiplier = 1.0 + sensitivity * 4.0; // [1.0, 5.0]
    return mean + stddev * multiplier;
}

// ── Peak finding ────────────────────────────────────────────

std::vector<int> Slicer::FindPeaks(
    const std::vector<double>& detectionFn,
    double threshold,
    int minDistance)
{
    std::vector<int> peaks;

    if (detectionFn.size() < 3) return peaks;

    // Find local maxima above threshold
    for (size_t i = 2; i < detectionFn.size() - 1; ++i) {
        if (detectionFn[i] > threshold &&
            detectionFn[i] > detectionFn[i - 1] &&
            detectionFn[i] >= detectionFn[i + 1])
        {
            peaks.push_back(static_cast<int>(i));
        }
    }

    // Also check boundaries: first frame above threshold
    if (detectionFn[1] > threshold && detectionFn[1] > detectionFn[0]) {
        // Already captured if it's a local max
        if (!peaks.empty() && peaks[0] == 0) {
            // adjust
        }
    }

    // Enforce minimum distance between peaks
    if (minDistance > 0 && peaks.size() > 1) {
        std::vector<int> filtered;
        filtered.push_back(peaks[0]);
        for (size_t i = 1; i < peaks.size(); ++i) {
            if (peaks[i] - filtered.back() >= minDistance) {
                filtered.push_back(peaks[i]);
            } else if (detectionFn[peaks[i]] > detectionFn[filtered.back()]) {
                // Replace with stronger peak
                filtered.back() = peaks[i];
            }
        }
        peaks = std::move(filtered);
    }

    return peaks;
}

// ── Main detection ──────────────────────────────────────────

std::vector<SlicePoint> Slicer::DetectTransients(
    const float* data, size_t numSamples,
    int sampleRate, int numChannels,
    double sensitivity)
{
    std::vector<SlicePoint> slices;

    if (!data || numSamples == 0 || sampleRate <= 0 || numChannels <= 0) {
        return slices;
    }

    // Frame size ~23ms (good for transient detection on drums/breaks)
    // At 44100Hz stereo: ~1024 samples
    int frameSize = std::max(256, sampleRate / 43);

    // Compute energy flux
    std::vector<double> flux = ComputeEnergyFlux(
        data, numSamples, sampleRate, numChannels, frameSize);

    if (flux.size() < 2) {
        // Not enough data — return whole file as one slice
        double totalDuration = static_cast<double>(numSamples / numChannels) /
                               static_cast<double>(sampleRate);
        SlicePoint sp;
        sp.startTime = 0.0;
        sp.endTime = totalDuration;
        sp.duration = totalDuration;
        sp.index = 0;
        sp.label = LabelForSlice(0, 0.0, totalDuration);
        slices.push_back(sp);
        return slices;
    }

    // Compute adaptive threshold
    double threshold = ComputeThreshold(flux, sensitivity);

    // Minimum distance between peaks in frames (~100ms minimum slice)
    int minDistanceFrames = std::max(2, sampleRate / (frameSize / 2) / 10);
    if (minDistanceFrames < 2) minDistanceFrames = 2;

    // Find peaks
    int hopSize = frameSize / 2;
    std::vector<int> peakFrames = FindPeaks(flux, threshold, minDistanceFrames);

    // Convert peak frames to slice points
    double totalDuration = static_cast<double>(numSamples / numChannels) /
                           static_cast<double>(sampleRate);

    if (peakFrames.empty()) {
        // No transients found — return whole file as one slice
        SlicePoint sp;
        sp.startTime = 0.0;
        sp.endTime = totalDuration;
        sp.duration = totalDuration;
        sp.index = 0;
        sp.label = LabelForSlice(0, 0.0, totalDuration);
        slices.push_back(sp);
        return slices;
    }

    // Convert frame indices to time
    std::vector<double> onsetTimes;
    for (int frame : peakFrames) {
        double time = (static_cast<double>(frame) * static_cast<double>(hopSize)) /
                      static_cast<double>(sampleRate);
        // Clamp to valid range
        if (time < totalDuration) {
            onsetTimes.push_back(time);
        }
    }

    // Ensure we have at least the start
    if (onsetTimes.empty()) {
        SlicePoint sp;
        sp.startTime = 0.0;
        sp.endTime = totalDuration;
        sp.duration = totalDuration;
        sp.index = 0;
        sp.label = LabelForSlice(0, 0.0, totalDuration);
        slices.push_back(sp);
        return slices;
    }

    // Build slices
    for (size_t i = 0; i < onsetTimes.size(); ++i) {
        SlicePoint sp;
        sp.startTime = onsetTimes[i];
        sp.endTime = (i + 1 < onsetTimes.size()) ? onsetTimes[i + 1] : totalDuration;
        sp.duration = sp.endTime - sp.startTime;
        sp.index = static_cast<int>(i);
        sp.label = LabelForSlice(static_cast<int>(i), sp.startTime, sp.duration);
        slices.push_back(sp);
    }

    return slices;
}

// ── DetectFromFile ──────────────────────────────────────────
// This is a placeholder — the actual REAPER PCM_Source file reading
// is done in the command handler since it needs the ReaperAPI.
// This class focuses on the signal processing algorithm.
