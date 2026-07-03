#include <gtest/gtest.h>

// Include source directly for unit testing
#include "../src/pipeline_stage_manager.h"

#include <set>
#include <string>

// ============================================================
// PipelineStageManager tests
// ============================================================

TEST(PipelineStageManagerTest, DefaultConstruction)
{
    PipelineStageManager mgr;
    EXPECT_FALSE(mgr.isActive(1));
    EXPECT_EQ(mgr.getCurrentStage(1), PipelineStage::NONE);
}

TEST(PipelineStageManagerTest, LabelIsHardEffortEasy)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:easy", "stage:builder"};
    EXPECT_FALSE(mgr.isHardEffort(labels));
    
    // No effort label at all
    std::set<std::string> noEffort = {"bug", "ui"};
    EXPECT_FALSE(mgr.isHardEffort(noEffort));
}

TEST(PipelineStageManagerTest, LabelIsHardEffortHard)
{
    PipelineStageManager mgr;
    
    // Various forms of hard effort labels
    std::set<std::string> labels1 = {"effort:hard", "stage:planner"};
    EXPECT_TRUE(mgr.isHardEffort(labels1));
    
    std::set<std::string> labels2 = {"hard", "bug"};
    EXPECT_TRUE(mgr.isHardEffort(labels2));
    
    std::set<std::string> labels3 = {"complex"};
    EXPECT_TRUE(mgr.isHardEffort(labels3));
    
    // Labels with parentheses (issue #145 theme — parens in labels)
    std::set<std::string> labelsWithParens = {"effort:hard (complex)", "stage:builder"};
    // This shouldn't match since the whole label is "effort:hard (complex)" not "effort:hard"
    // But "hard" exact match won't find it either since it's not an exact label
    // The method does exact comparisons, not substring
    EXPECT_FALSE(mgr.isHardEffort(labelsWithParens)) 
        << "Label 'effort:hard (complex)' should not match exact 'effort:hard'";
}

TEST(PipelineStageManagerTest, InitializeIssueEasy)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:easy", "active:true"};
    mgr.initializeIssue(145, labels);
    
    EXPECT_TRUE(mgr.isActive(145));
    EXPECT_EQ(mgr.getCurrentStage(145), PipelineStage::PLANNER);
    EXPECT_FALSE(mgr.canCloseIssue(145));
}

TEST(PipelineStageManagerTest, InitializeIssueHard)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:hard", "active:true"};
    mgr.initializeIssue(200, labels);
    
    EXPECT_TRUE(mgr.isActive(200));
    EXPECT_EQ(mgr.getCurrentStage(200), PipelineStage::PLANNER);
}

TEST(PipelineStageManagerTest, AdvanceStageEasyFlow)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:easy"};
    mgr.initializeIssue(42, labels);
    
    // Easy flow: PLANNER -> BUILDER -> TESTER -> CLOSED
    EXPECT_TRUE(mgr.advanceStage(42));  // PLANNER -> BUILDER
    EXPECT_EQ(mgr.getCurrentStage(42), PipelineStage::BUILDER);
    
    EXPECT_TRUE(mgr.advanceStage(42));  // BUILDER -> TESTER
    EXPECT_EQ(mgr.getCurrentStage(42), PipelineStage::TESTER);
    EXPECT_TRUE(mgr.canCloseIssue(42));
    
    EXPECT_TRUE(mgr.advanceStage(42));  // TESTER -> CLOSED
    EXPECT_EQ(mgr.getCurrentStage(42), PipelineStage::CLOSED);
    EXPECT_TRUE(mgr.canCloseIssue(42));
    
    // Further advances should fail (terminal)
    EXPECT_FALSE(mgr.advanceStage(42));
}

TEST(PipelineStageManagerTest, AdvanceStageHardFlow)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:hard"};
    mgr.initializeIssue(99, labels);
    
    // Hard flow: PLANNER -> BUILDER -> REVIEWER -> SCREENSHOT -> TESTER -> CLOSED
    EXPECT_TRUE(mgr.advanceStage(99));  // PLANNER -> BUILDER
    EXPECT_EQ(mgr.getCurrentStage(99), PipelineStage::BUILDER);
    
    EXPECT_TRUE(mgr.advanceStage(99));  // BUILDER -> REVIEWER
    EXPECT_EQ(mgr.getCurrentStage(99), PipelineStage::REVIEWER);
    
    EXPECT_TRUE(mgr.advanceStage(99));  // REVIEWER -> SCREENSHOT
    EXPECT_EQ(mgr.getCurrentStage(99), PipelineStage::SCREENSHOT);
    
    EXPECT_FALSE(mgr.canCloseIssue(99)) << "Cannot close before TESTER";
    
    EXPECT_TRUE(mgr.advanceStage(99));  // SCREENSHOT -> TESTER
    EXPECT_EQ(mgr.getCurrentStage(99), PipelineStage::TESTER);
    EXPECT_TRUE(mgr.canCloseIssue(99));
    
    EXPECT_TRUE(mgr.advanceStage(99));  // TESTER -> CLOSED
    EXPECT_EQ(mgr.getCurrentStage(99), PipelineStage::CLOSED);
}

TEST(PipelineStageManagerTest, CloseAndReopen)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:easy"};
    mgr.initializeIssue(10, labels);
    
    // Full easy cycle
    mgr.advanceStage(10);  // PLANNER -> BUILDER
    mgr.advanceStage(10);  // BUILDER -> TESTER
    mgr.advanceStage(10);  // TESTER -> CLOSED
    
    EXPECT_TRUE(mgr.canCloseIssue(10));
    
    // Reset for re-processing
    mgr.resetIssue(10);
    EXPECT_EQ(mgr.getCurrentStage(10), PipelineStage::PLANNER);
    EXPECT_TRUE(mgr.isActive(10));
}

TEST(PipelineStageManagerTest, StageSequenceEasy)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:easy"};
    mgr.initializeIssue(5, labels);
    
    auto seq = mgr.getStageSequence(5);
    ASSERT_EQ(seq.size(), 4);
    EXPECT_EQ(seq[0], PipelineStage::PLANNER);
    EXPECT_EQ(seq[1], PipelineStage::BUILDER);
    EXPECT_EQ(seq[2], PipelineStage::TESTER);
    EXPECT_EQ(seq[3], PipelineStage::CLOSED);
}

TEST(PipelineStageManagerTest, StageSequenceHard)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:hard"};
    mgr.initializeIssue(7, labels);
    
    auto seq = mgr.getStageSequence(7);
    ASSERT_EQ(seq.size(), 6);
    EXPECT_EQ(seq[0], PipelineStage::PLANNER);
    EXPECT_EQ(seq[1], PipelineStage::BUILDER);
    EXPECT_EQ(seq[2], PipelineStage::REVIEWER);
    EXPECT_EQ(seq[3], PipelineStage::SCREENSHOT);
    EXPECT_EQ(seq[4], PipelineStage::TESTER);
    EXPECT_EQ(seq[5], PipelineStage::CLOSED);
}

TEST(PipelineStageManagerTest, InvalidAdvanceAfterClose)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:easy"};
    mgr.initializeIssue(0, labels);
    mgr.closeIssue(0);
    
    // Already closed — advance should fail
    EXPECT_FALSE(mgr.advanceStage(0));
    EXPECT_EQ(mgr.getCurrentStage(0), PipelineStage::CLOSED);
}

TEST(PipelineStageManagerTest, NonExistentIssueReturnsNone)
{
    PipelineStageManager mgr;
    
    EXPECT_EQ(mgr.getCurrentStage(999), PipelineStage::NONE);
    EXPECT_FALSE(mgr.advanceStage(999));
    EXPECT_EQ(mgr.getNextExpectedStage(999), PipelineStage::NONE);
    
    auto seq = mgr.getStageSequence(999);
    EXPECT_TRUE(seq.empty());
}

TEST(PipelineStageManagerTest, CanNotCloseAtBuilder)
{
    PipelineStageManager mgr;
    
    std::set<std::string> labels = {"effort:easy"};
    mgr.initializeIssue(3, labels);
    
    // At PLANNER
    EXPECT_FALSE(mgr.canCloseIssue(3));
    
    // At BUILDER
    mgr.advanceStage(3);
    EXPECT_FALSE(mgr.canCloseIssue(3));
}
