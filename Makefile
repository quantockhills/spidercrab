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

check: lint build test

check-all: lint frontend-lint build frontend-build test frontend-test

# ---- Git ----

git-status:
	git status

docs-pull:
	@echo "SDK + WDL are symlinked in docs/."
	@echo "helgobox (Playtime 2 / ReaLearn) is cloned at docs/helgobox/"
	@echo "To refresh: git -C docs/helgobox pull"

.PHONY: all build lint test deploy check fmt docs-pull
