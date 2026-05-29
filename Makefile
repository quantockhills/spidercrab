.PHONY: all build lint test clean fmt

all: lint build test

# ---- C++ Extension ----

build:
	cd extension && bash build.sh

build-debug:
	BUILD_TYPE=debug cd extension && bash build.sh

lint:
	cd extension && bash lint.sh

lint-fix:
	cd extension && bash lint.sh --fix

fmt:
	clang-format -i extension/src/*.cpp extension/src/*.h extension/test/*.cpp

# Build and run C++ tests (uses CMake + Google Test)
test:
	@echo "=== Building C++ tests ==="
	@mkdir -p extension/build
	cd extension/build && cmake .. -DCMAKE_BUILD_TYPE=Debug 2>&1 | tail -3
	cd extension/build && cmake --build . --target reaper-ipad-test 2>&1 | tail -5
	@echo ""
	@echo "=== Running C++ tests ==="
	cd extension/build && ./reaper-ipad-test

deploy:
	cd extension && bash deploy.sh

# ---- Frontend ----

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-lint:
	cd frontend && npm run lint

frontend-test:
	cd frontend && npm test

frontend-typecheck:
	cd frontend && npm run typecheck

frontend-build:
	cd frontend && npm run build

# ---- Everything ----

# ---- Headless Testing (requires Reaper + Xvfb) ----

# Start Reaper headless with extension loaded (background)
headless-start:
	bash test/headless_test.sh --no-build

# Quick check: is the WebSocket server running?
headless-status:
	@if ss -tlnp 2>/dev/null | grep -q :9224; then \
		echo "✅ WebSocket server running on port 9224"; \
	else \
		echo "❌ WebSocket server not detected on port 9224"; \
		echo "   Run 'make headless-launch' first"; \
	fi

# Kill headless Reaper
headless-stop:
	@pkill -x reaper 2>/dev/null && echo "✅ Reaper stopped" || echo "ℹ️  Reaper was not running"

# Build, launch, and run headless connectivity tests
headless-test:
	bash test/headless_test.sh

# Launch Reaper headless (background, for interactive use)
headless-launch:
	@echo "Starting Xvfb + Reaper headless..."
	@if ! pgrep -x Xvfb > /dev/null 2>&1; then \
		Xvfb :99 -screen 0 1024x768x24 & \
		sleep 1; \
	fi
	@export DISPLAY=:99 && export LD_LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib:$$LD_LIBRARY_PATH && \
		~/reaper-portable/reaper &
	@sleep 3
	@echo "✅ Reaper launched headless on :99"
	@echo "   PID: $$(pgrep -x reaper)"
	@echo "   WebSocket: port 9224"

check: lint build test

check-all: lint frontend-lint build frontend-build test frontend-test

# ---- Git ----

git-status:
	git status

docs-pull:
	@echo "Everything is in docs/ already."
	@echo "  docs/reaper-sdk/ — SDK headers"
	@echo "  docs/WDL/ — Cockos Foundation Library"
	@echo "  docs/helgobox/ — Playtime 2 / ReaLearn"
	@echo "To update helgobox: git -C docs/helgobox pull"

.PHONY: all build lint test deploy check fmt docs-pull
