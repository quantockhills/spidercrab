#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# pipeline_smoke_test.sh
#
# Spidercrab pipeline orchestrator health check.
# Validates that the orchestrator infrastructure is functional
# and that pipeline stages can progress end-to-end.
# ============================================================

PASS=0
FAIL=0

red()   { printf "\033[31m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

check() {
    local desc="$1"
    shift
    if eval "$@"; then
        green "  ✓ $desc"
        ((PASS++))
    else
        red "  ✗ $desc"
        ((FAIL++))
    fi
}

bold "=== Spidercrab Pipeline Smoke Test ==="
echo ""

# 1. Worktree exists and is on feat/playtime-clip-ops
WORKTREE="/home/sasha/projects/reaper-ipad"
check "Worktree directory exists" test -d "$WORKTREE"

BRANCH=$(cd "$WORKTREE" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
check "On feat/playtime-clip-ops branch" test "$BRANCH" = "feat/playtime-clip-ops"

# 2. Stage file exists
check "Stage file exists" test -f /home/sasha/cron_stage.txt
check "Current issue file exists" test -f /home/sasha/current_issue.txt

# 3. Remote origin is reachable
check "Git remote is configured" \
    git -C "$WORKTREE" remote get-url origin >/dev/null 2>&1

# 4. Repo has a valid commit history
check "Repo has at least one commit" \
    git -C "$WORKTREE" log --oneline -1 >/dev/null 2>&1

# 5. Gitea API is responsive
check "Gitea API is reachable" \
    curl -sf -o /dev/null http://localhost:3000/api/v1/version 2>/dev/null

# 6. Makefile is present (used by Tester stage)
check "Makefile exists" test -f "$WORKTREE/Makefile"

# 7. Extension test directory exists
check "Extension test dir exists" test -d "$WORKTREE/extension/test"

echo ""
bold "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    red "=== SMOKE TEST FAILED ==="
    exit 1
else
    green "=== SMOKE TEST PASSED ==="
    exit 0
fi
