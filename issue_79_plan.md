## Root Cause Analysis: FX Chain Load/Apply Doesn't Work

I traced the full code path from frontend → WebSocket → extension command handler → REAPER API. The UI and WebSocket plumbing are correct. The bug is entirely in the C++ extension's `HandleFxChainLoad` function and its helpers.

## Bug 1 (PRIMARY): `replaceFxChainInChunk` corrupts track chunk with duplicate closing `>`

**Location:** `extension/src/command_handler.cpp` line ~1784

```cpp
if (fxChainEnd != std::string::npos) {
    std::string result = chunk.substr(0, start);
    result += newFxChain;         // newFxChain is a complete <FXCHAIN\n...\n> block
    result += "\n";
    result += chunk.substr(fxChainEnd);   // BUG: fxChainEnd is the position of the original closing >
    return result;
}
```

When a track already has an FX chain, `replaceFxChainInChunk` finds the `start` (`<FXCHAIN`) and `fxChainEnd` (the matching closing `>`). The replacement `newFxChain` is already a complete block ending with `>` (e.g. `<FXCHAIN\n...\n>`). But `chunk.substr(fxChainEnd)` **also starts with the original closing `>`**, producing a corrupted chunk with duplicate `>` characters.

This malformed chunk causes REAPER's `SetTrackStateChunk` to silently fail.

**The fix:** Change `chunk.substr(fxChainEnd)` to `chunk.substr(fxChainEnd + 1)`.

## Bug 2: `extractFxChainFromChunk` fails on XML-wrapped .RfxChain files

**Location:** `extension/src/command_handler.cpp` line ~1671

Native REAPER .RfxChain files often use an XML wrapper:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<REAPER_PRESET name="..." desc="...">hash
<FXCHAIN
  ...
>
</FXCHAIN>
</REAPER_PRESET>
```

The `extractFxChainFromChunk` depth algorithm treats all `<` as opening tags and all `>` as closing tags. It does not distinguish `<TAG>` (opening) from `</TAG>` (closing). When encountering `</FXCHAIN>`, it increments depth instead of decrementing it, causing the function to never reach depth 0 and return empty string.

The fallback then wraps the **entire file content** (XML header, REAPER_PRESET tags, etc.) inside `<FXCHAIN\n...\n>`, creating a completely malformed chunk.

**The fix:** In `extractFxChainFromChunk`, detect `</` as a closing tag and decrement depth instead of incrementing.

## Why Existing Tests Don't Catch This

1. **Test `LoadChainReplacesTrackFx`**: Creates FX chain file in raw `<FXCHAIN\n...\n>` format (no XML wrapper). Only checks substring presence — never validates chunk structure.
2. **Test `SaveAndLoadRoundTrip`**: Same substring-only checking.
3. No test uses XML-wrapped .RfxChain files.
4. The mock `SetTrackStateChunk` just stores the string without validation.

## Files That Need Modification

1. **`extension/src/command_handler.cpp`** — Two fixes:
   - `replaceFxChainInChunk`: change `chunk.substr(fxChainEnd)` → `chunk.substr(fxChainEnd + 1)`
   - `extractFxChainFromChunk`: add `</TAG>` closing tag detection

2. **`extension/test/test_command_handler.cpp`** — Add tests that:
   - Verify replaced chunk is well-formed (count `>` depth, verify no duplicates)
   - Test loading an XML-wrapped .RfxChain file
   - Test loading onto track with existing FX (replace path, append path)

3. **`frontend/src/test/FxChainBrowser.test.tsx`** — Already mocks `fxChainLoad` to return true, no change needed.

## Edge Cases

- **Track with no FX chain:** The "no existing FXCHAIN" path inserts before the TRACK close `>`. This path is correct (no duplicate `>`).
- **Append mode:** Calls `replaceFxChainInChunk` too, so Bug 1 affects append as well.
- **Files saved by the extension:** Saved as `<FXCHAIN\n...\n>` (no XML wrapper) — only Bug 1 applies.
- **Files saved by native REAPER:** May have XML wrapper — both bugs apply.
- **Empty .RfxChain file:** Handled by empty-check before replacement.

## Screenshot Verification Plan

1. **Before fix, after fix:** In REAPER, open track with no FX. Load an .RfxChain file. Screenshot shows FX appear on track.
2. **Replace case:** Load chain onto track that already has FX. Screenshot shows old FX replaced by new.
3. **Append case:** Load chain in append mode. Screenshot shows old FX + new FX together.
