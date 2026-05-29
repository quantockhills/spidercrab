# Workflow Pipelines

Each task category has a defined pipeline. Follow the steps in order.
Pipelines are sequential; each stage must pass before the next begins.
If any stage fails, loop back to the failed stage's predecessor.

---

## UI Feature (default)

For any UI feature (new screen, component, or UX change):

```
Builder → Reviewer → Screenshot Verifier → Tester → Close
```

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Builder** | Write code, commit | Compiles, lints clean |
| **Reviewer** | Read diff, check against AGENTS.md + UI.md + issue body | No regressions, matches spec |
| **Screenshot Verifier** | Full stack → Playwright screenshots → Kimi K2.6 visual check | Screenshots match claims |
| **Tester** | Run all unit + integration + E2E tests | All pass |
| **Close** | Close Gitea issue, push | — |

### Notes
- The Screenshot Verifier **must** be spawned with
  `model: "openrouter/moonshotai/kimi-k2.6"` (DeepSeek can't do vision).
- Wait for async data before screenshotting — use WebSocket response
  waits, not wall-clock timeouts.

---

## Backend / C++ Extension

For any backend change (WebSocket server, command handlers, REAPER API):

```
Builder → Reviewer → Integration Tester → Close
```

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Builder** | Write C++ code, `make build` | Compiles |
| **Reviewer** | Read diff, check for memory safety, ABI issues | Clean |
| **Integration Tester** | `make test` (C++ GTest) + `make deploy` + headless test | All pass |
| **Close** | Close Gitea issue, push | — |

### Notes
- No Screenshot Verifier needed — backend changes have no visual output.
- Headless tests at `extension/test/run_headless_test.sh`.

---

## Design / Layout Change

For any visual/layout change (CSS, component structure, responsive breakpoints):

```
Designer → Builder → Reviewer → Screenshot Verifier → Close
```

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Designer** | Review design resources, create spec/mockup | Approved |
| **Builder** | Implement CSS/components | Matches design spec |
| **Reviewer** | Read diff, check design-guidelines compliance | No violations |
| **Screenshot Verifier** | Full stack → Playwright screenshots → Kimi K2.6 visual check | Matches design spec |
| **Close** | Close Gitea issue, push | — |

### Notes
- No Tester stage — layout changes don't affect unit/integration test
  outcomes. If tests break, that's a separate bug.
- The Designer stage is a human-in-the-loop step (not automated).
- The Screenshot Verifier should specifically check against the
  design guidelines (colors, shapes, spacing).

### Designer Resources
A Designer agent should check ALL of these before starting:
- `design/design-guidelines.md` — full design rules (colors, fonts, shapes)
- `design/designer-prompt.md` — brief with context + deliverables
- `design/original-theme/` — 80gray v2.2 REAPER theme files (reference)
- `docs/UI.md` — current screen layouts and interactions
- Everforest palette: github.com/sainnhe/everforest
- Inter font: rsms.me/inter (or Google Fonts)
- Current screenshots: `gui_testing/*.png`

---

## Documentation / Meta

For docs, config, process changes:

```
Builder → Reviewer → Close
```

No testing or visual verification needed unless the doc change affects
other pipelines (e.g., updating workflow definitions).
