# Issue #108 Plan — recorded here for handoff

## Research Summary

I've verified the issue body's analysis. The current `HandleSampleSendToSlot` exists in `command_handler.cpp` but:
- It is NOT registered in the command map (no `m_commandMap["sample/sendToSlot"]`)
- It does InsertMedia → updates PlaytimeState metadata — but Playtime 2 never learns about the clip
- The frontend `SampleBrowser.tsx` already has `sendToSlot` prop typed, but `App.tsx` doesn't pass it
- `useSampleBrowser.ts` doesn't have `sendSampleToSlot`
- The Lua preset has trigger & record mappings but no import mappings
- The OSC sender has trigger/record helpers but no `sendImportSlotMessage`

## Key gotchas uncovered during research
- OSC sender sends to port 9001 (not 9000 as the issue body says — 9001 is correct, matches the ReaLearn control input port set in main.cpp)
- Item manipulation APIs (CountTrackMediaItems, GetMediaItem, SetMediaItemInfo_Value) have REAPERAPI_WANT macros but are NOT loaded in InitializeCoreServices() — Builder must add those assignments
- Should avoid I_SELECTED (known crash trigger)
- Should use GetSetMediaTrackInfo_String for track names
