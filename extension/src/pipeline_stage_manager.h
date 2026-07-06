#pragma once

#include <map>
#include <set>
#include <string>
#include <vector>
#include <mutex>

// ============================================================
// PipelineStageManager — Enforces Assembly Line stage progression
//
// This manager tracks the current stage of each issue in the
// spidercrab pipeline and prevents skipping stages when closing
// issues. The pipeline flow is:
//
//   effort:easy → Planner → Builder → Close
//   effort:hard → Planner → Builder → Reviewer → Screenshot → Tester → Close
//
// The Tester stage is the ONLY stage that can close an issue.
// All other stages must complete before Tester runs.
// ============================================================

enum class PipelineStage {
    NONE = 0,
    PLANNER = 1,
    BUILDER = 2,
    REVIEWER = 3,
    SCREENSHOT = 4,
    TESTER = 5,
    CLOSED = 6
};

struct StageInfo {
    PipelineStage currentStage = PipelineStage::NONE;
    std::set<PipelineStage> completedStages;
    bool effortHard = false;  // Whether this is a hard-effort issue
    std::string lastUpdated;  // Timestamp of last stage change
};

class PipelineStageManager {
public:
    PipelineStageManager() = default;

    // Determine if an issue is "hard" effort based on labels
    bool isHardEffort(const std::set<std::string>& labels) const {
        // Check for effort labels
        for (const auto& label : labels) {
            if (label == "effort:hard" || label == "hard" || label == "complex") {
                return true;
            }
        }
        return false;
    }

    // Initialize an issue with the correct starting stage
    void initializeIssue(int issueNumber, const std::set<std::string>& labels) {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto& info = m_issues[issueNumber];
        info.effortHard = isHardEffort(labels);
        info.currentStage = PipelineStage::PLANNER;
        info.completedStages.clear();
        info.lastUpdated = getCurrentTimestamp();
    }

    // Check if an issue is active (has the active:true label)
    bool isActive(int issueNumber) const {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        return it != m_issues.end() && it->second.currentStage != PipelineStage::CLOSED;
    }

    // Get the current stage for an issue
    PipelineStage getCurrentStage(int issueNumber) const {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        return (it != m_issues.end()) ? it->second.currentStage : PipelineStage::NONE;
    }

    // Advance to the next stage (called by each stage when it completes)
    // Returns true if advancement was successful, false if invalid transition
    bool advanceStage(int issueNumber) {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        if (it == m_issues.end()) return false;

        StageInfo& info = it->second;
        PipelineStage current = info.currentStage;
        PipelineStage next = getNextStage(current, info.effortHard);

        if (next == PipelineStage::NONE) {
            // Already at CLOSED or invalid transition
            return false;
        }

        // Mark current stage as completed
        info.completedStages.insert(current);
        info.currentStage = next;
        info.lastUpdated = getCurrentTimestamp();

        return true;
    }

    // Check if an issue can be closed (only from Tester stage)
    bool canCloseIssue(int issueNumber) const {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        if (it == m_issues.end()) return false;

        const StageInfo& info = it->second;
        return info.currentStage == PipelineStage::TESTER ||
               info.currentStage == PipelineStage::CLOSED;
    }

    // Check if a stage transition is valid (prevents skipping)
    bool isValidStageTransition(int issueNumber, PipelineStage from, PipelineStage to) const {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        if (it == m_issues.end()) return false;

        const StageInfo& info = it->second;
        
        // Must advance sequentially
        PipelineStage expectedNext = getNextStage(from, info.effortHard);
        return to == expectedNext;
    }

    // Mark an issue as closed
    void closeIssue(int issueNumber) {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        if (it != m_issues.end()) {
            it->second.currentStage = PipelineStage::CLOSED;
            it->second.lastUpdated = getCurrentTimestamp();
        }
    }

    // Get the expected next stage for an issue
    PipelineStage getNextExpectedStage(int issueNumber) const {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        if (it == m_issues.end()) return PipelineStage::NONE;

        return getNextStage(it->second.currentStage, it->second.effortHard);
    }

    // Get all stages in order for an issue
    std::vector<PipelineStage> getStageSequence(int issueNumber) const {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        if (it == m_issues.end()) return {};

        std::vector<PipelineStage> sequence;
        if (it->second.effortHard) {
            sequence = {PipelineStage::PLANNER, PipelineStage::BUILDER, 
                        PipelineStage::REVIEWER, PipelineStage::SCREENSHOT,
                        PipelineStage::TESTER, PipelineStage::CLOSED};
        } else {
            sequence = {PipelineStage::PLANNER, PipelineStage::BUILDER,
                        PipelineStage::TESTER, PipelineStage::CLOSED};
        }
        return sequence;
    }

    // Reset an issue (for testing or re-processing)
    void resetIssue(int issueNumber) {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_issues.find(issueNumber);
        if (it != m_issues.end()) {
            it->second.currentStage = PipelineStage::PLANNER;
            it->second.completedStages.clear();
        }
    }

private:
    std::map<int, StageInfo> m_issues;
    mutable std::mutex m_mutex;

    PipelineStage getNextStage(PipelineStage current, bool effortHard) const {
        switch (current) {
            case PipelineStage::NONE:
                return PipelineStage::PLANNER;
            case PipelineStage::PLANNER:
                return PipelineStage::BUILDER;
            case PipelineStage::BUILDER:
                return effortHard ? PipelineStage::REVIEWER : PipelineStage::TESTER;
            case PipelineStage::REVIEWER:
                return PipelineStage::SCREENSHOT;
            case PipelineStage::SCREENSHOT:
                return PipelineStage::TESTER;
            case PipelineStage::TESTER:
                return PipelineStage::CLOSED;
            case PipelineStage::CLOSED:
                return PipelineStage::NONE;  // Terminal state — no further advancement
        }
        return PipelineStage::NONE;
    }

    std::string getCurrentTimestamp() const {
        auto now = std::time(nullptr);
        char buf[64];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&now));
        return std::string(buf);
    }
};

// Global instance
extern PipelineStageManager g_pipelineStageManager;