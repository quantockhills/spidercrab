# Workflow Pipelines

Each task category has a defined pipeline. Follow the steps in order.
Pipelines are sequential; each stage must pass before the next begins.
If any stage fails, loop back to the failed stage's predecessor.

**Planner is required in ALL pipelines.** Every issue — whether new feature or
bug fix — starts with a Planner pass that reads the relevant APIs, SDKs, source
code, and writes a plan before any code is written.

---

## UI Feature (default)

For any UI feature (new screen, component, or UX change):

```
Planner → Builder → Reviewer → Screenshot Verifier → Tester
```

**🔒 Only 🧪 Tester may close the issue. No other stage is authorized.**

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Planner** | Read issue + SDK docs + source + design docs → Gitea plan comment | Plan approved |
| **Builder** | Write code, commit | Compiles, lints clean |
| **Reviewer** | Read diff, check against AGENTS.md + UI.md + issue body | No regressions, matches spec |
| **Screenshot Verifier** | Full stack → Playwright screenshots → Kimi K2.6 visual check | Screenshots match claims |
| **Tester** | Review test completeness + coverage + edge cases + check Playwright/E2E tests exist (1 per feature, 2-3 per milestone) + run all unit/integration/E2E tests | All pass + tests cover the issue + Playwright tests exist |
| **Close** (🧪 Tester only) | Close Gitea issue, push | — |

**Tester may restart pipeline:** If the approach is wrong (not just code), loop back to Planner instead of Builder.

### Notes
- The Screenshot Verifier **must** be spawned with
  `model: "openrouter/moonshotai/kimi-k2.6"` (DeepSeek can't do vision).
- Wait for async data before screenshotting — use WebSocket response
  waits, not wall-clock timeouts.

---

## Backend / C++ Extension

For any backend change (WebSocket server, command handlers, REAPER API):

```
Planner → Builder → Reviewer → Integration Tester
```

**🔒 Only 🧪 Tester may close the issue.**

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Planner** | Read issue + SDK docs + source → Gitea plan comment | Plan approved |
| **Builder** | Write C++ code, `make build` | Compiles |
| **Reviewer** | Read diff, check for memory safety, ABI issues | Clean |
| **Integration Tester** | Review test quality (edge cases, real semantics, Playwright coverage) + `make test` + `make deploy` + headless test | All pass + tests cover the fix |
| **Close** (🧪 Tester only) | Close Gitea issue, push | — |

**Tester may restart pipeline:** If the approach is wrong, loop back to Planner instead of Builder.

### Notes
- No Screenshot Verifier needed — backend changes have no visual output.
- Headless tests at `extension/test/run_headless_test.sh`.

---

## Design / Layout Change

For any visual/layout change (CSS, component structure, responsive breakpoints):

```
Planner → Designer → Builder → Reviewer → Screenshot Verifier → Tester
```

**🔒 Only 🧪 Tester may close the issue.** UI tests must pass even for layout changes, unless they're purely cosmetic.

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Planner** | Read design docs + source → Gitea plan comment | Plan approved |
| **Designer** | Read design docs → commit `design/spec-<issue>.md` → comment on issue | Approved |
| **Builder** | Implement CSS/components | Matches design spec |
| **Reviewer** | Read diff, check design-guidelines compliance | No violations |
| **Screenshot Verifier** | Full stack → Playwright screenshots → Kimi K2.6 visual check | Matches design spec |
| **Close** (🧪 Tester only) | Close Gitea issue, push | — |

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

## Bug Fix / Debugging

For any bug fix (crashes, incorrect behaviour, regressions):

```
Planner → Builder → Reviewer → Integration Tester
```

**🔒 Only 🧪 Tester may close the issue.**

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Planner** | Reproduce bug → trace code path → check SDK docs → root cause analysis → plan | Root cause identified |
| **Builder** | Write fix + tests | Compiles |
| **Reviewer** | Read diff, check for regressions, verify edge cases | Clean |
| **Integration Tester** | Review test quality (does test actually prove fix? Playwright coverage?) + `make test` + headless test + verify bug is fixed | All pass + bug gone + tests prove it |
| **Close** (🧪 Tester only) | Close Gitea issue, push | — |

**Tester may restart pipeline:** If the approach is wrong, loop back to Planner instead of Builder.

### Planner debugging checklist
- [ ] Can you reproduce the bug? What are the exact steps?
- [ ] Trace the code path — what's the expected flow vs actual?
- [ ] Check SDK docs — are you using the API correctly? (Wrong API usage looks like memory corruption)
- [ ] Check for edge cases: empty state, null pointers, division by zero, range boundaries
- [ ] Check the frontend ↔ backend data flow — is the JSON payload correct?
- [ ] Check if the bug is platform-specific (Linux vs Windows)
- [ ] Write the root cause + fix plan as a Gitea issue comment

---

## Documentation / Meta

For docs, config, process changes:

```
Planner → Builder → Reviewer → Close
```

**Doc-only issues:** Builder may close after Reviewer approves, since no tests apply.

| Stage | Tool | Pass/Fail |
|-------|------|-----------|
| **Planner** | Read issue + relevant docs → plan | Plan approved |
| **Builder** | Write docs | Reads well |
| **Reviewer** | Proofread, check accuracy | Clean |

No testing or visual verification needed unless the doc change affects
other pipelines (e.g., updating workflow definitions).
