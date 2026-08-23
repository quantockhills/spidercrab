--- name: spidercrab OSC -> Playtime
--- realearn_version: 2.16.0
--- description: |
---   Maps spidercrab OSC messages to Playtime 2.
---   8x8 slot grid (trigger + record) and 8 scene buttons.
---
---   OSC device setup in ReaLearn:
---     Control input:  listen on port 9001
---     Feedback output: 127.0.0.1:9011

local COLS = 8
local ROWS = 8
local mappings = {}

-- Slot trigger mappings: /playtime/slot/COL/ROW/trigger
for col = 0, COLS - 1 do
    for row = 0, ROWS - 1 do
        table.insert(mappings, {
            name = string.format("Trigger %d/%d", col + 1, row + 1),
            source = {
                kind = "Osc",
                address = string.format("/playtime/slot/%d/%d/trigger", col, row),
                argument = { index = 0, kind = "Float" },
                feedback_behavior = "Normal",
            },
            glue = { absolute_mode = "Normal" },
            target = {
                kind = "ClipTransportAction",
                slot = {
                    address = "ByIndex",
                    column_index = col,
                    row_index = row,
                },
                action = "Trigger",
                stop_column_if_slot_empty = true,
            },
        })
    end
end

-- Slot record mappings: /playtime/slot/COL/ROW/record
for col = 0, COLS - 1 do
    for row = 0, ROWS - 1 do
        table.insert(mappings, {
            name = string.format("Record %d/%d", col + 1, row + 1),
            source = {
                kind = "Osc",
                address = string.format("/playtime/slot/%d/%d/record", col, row),
                argument = { index = 0, kind = "Float" },
                feedback_behavior = "Normal",
            },
            glue = { absolute_mode = "Normal" },
            target = {
                kind = "ClipTransportAction",
                slot = {
                    address = "ByIndex",
                    column_index = col,
                    row_index = row,
                },
                action = "RecordStop",
                stop_column_if_slot_empty = true,
            },
        })
    end
end

-- Slot import mappings: /playtime/slot/COL/ROW/import
for col = 0, COLS - 1 do
    for row = 0, ROWS - 1 do
        table.insert(mappings, {
            name = string.format("Import %d/%d", col + 1, row + 1),
            source = {
                kind = "Osc",
                address = string.format("/playtime/slot/%d/%d/import", col, row),
                argument = { index = 0, kind = "Float" },
                feedback_behavior = "Normal",
            },
            glue = { absolute_mode = "Normal" },
            target = {
                kind = "PlaytimeSlotManagementAction",
                slot = {
                    address = "ByIndex",
                    column_index = col,
                    row_index = row,
                },
                action = "FillSlotWithSelectedItem",
            },
        })
    end
end

-- Slot clear mappings: /playtime/slot/COL/ROW/clear (delete clip)
for col = 0, COLS - 1 do
    for row = 0, ROWS - 1 do
        table.insert(mappings, {
            name = string.format("Clear %d/%d", col + 1, row + 1),
            source = {
                kind = "Osc",
                address = string.format("/playtime/slot/%d/%d/clear", col, row),
                argument = { index = 0, kind = "Float" },
                feedback_behavior = "Normal",
            },
            glue = { absolute_mode = "Normal" },
            target = {
                kind = "PlaytimeSlotManagementAction",
                slot = {
                    address = "ByIndex",
                    column_index = col,
                    row_index = row,
                },
                action = "ClearSlot",
            },
        })
    end
end

-- Scene trigger mappings: /playtime/scene/ROW/trigger
for row = 0, ROWS - 1 do
    table.insert(mappings, {
        name = string.format("Scene %d", row + 1),
        source = {
            kind = "Osc",
            address = string.format("/playtime/scene/%d/trigger", row),
            argument = { index = 0, kind = "Float" },
        },
        glue = { absolute_mode = "Normal" },
        target = {
            kind = "ClipRowAction",
            row = {
                address = "ByIndex",
                index = row,
            },
            action = "PlayScene",
        },
    })
end


-- Matrix-level mappings: /playtime/matrix/ACTION
--
-- Playtime's own transport and metronome, which are not REAPER's. The session
-- view's play/stop/record buttons drive the project transport; these drive the
-- matrix. Both are useful, and they are different things.
--
-- Action names come from ReaLearn's "Playtime: Matrix action" target.
local matrixActions = {
    { addr = "play",     action = "PlayStop" },
    { addr = "stop",     action = "Stop" },
    { addr = "click",    action = "ClickOnOffState" },
    { addr = "panic",    action = "Panic" },
    { addr = "taptempo", action = "TapTempo" },
}

for _, m in ipairs(matrixActions) do
    table.insert(mappings, {
        name = string.format("Matrix %s", m.addr),
        source = {
            kind = "Osc",
            address = string.format("/playtime/matrix/%s", m.addr),
            argument = { index = 0, kind = "Float" },
            feedback_behavior = "Normal",
        },
        glue = { absolute_mode = "Normal" },
        target = {
            kind = "PlaytimeMatrixAction",
            action = m.action,
        },
    })
end

return {
    kind = "MainCompartment",
    value = {
        mappings = mappings,
        custom_data = {
            playtime = {
                control_unit = {
                    column_count = COLS,
                    row_count = ROWS,
                },
            },
        },
    },
}
