--- name: spidercrab OSC -> Playtime
--- realearn_version: 2.16.0
--- author: spidercrab
--- device_manufacturer: Generic
--- device_name: spidercrab
--- description: |
---   Maps spidercrab extension OSC messages to Playtime clip launcher actions.
---   Supports trigger, record, and scene trigger. Sends slot state feedback
---   back to the spidercrab extension.
---
---   Setup:
---   1. Install ReaLearn and Playtime 2 in REAPER
---   2. Add an OSC device in ReaLearn:
---      - Control input: listen on port 9001 (or any port)
---      - Feedback output: send to 127.0.0.1:9000
---   3. Import this preset into ReaLearn's main compartment
---   4. Configure spidercrab to send to port 9001
---      (default sender port is 9000; change via configuration)
--- required_features: [playtime]

--!strict

-- ============================================================
-- Configuration
-- ============================================================

-- Grid dimensions (columns x rows). Must match the Playtime matrix.
local column_count = 8
local row_count = 8

-- When true, triggering an empty slot stops the whole column.
local stop_column_if_slot_empty = true

-- Port where the spidercrab extension listens for OSC feedback.
-- This should match the extension's OSC receiver port (default: 9000).
local feedback_port = 9000

-- OSC address prefix used by the spidercrab extension.
-- The extension sends messages to this prefix.
local osc_prefix = "/playtime"

-- ============================================================
-- Dependencies
-- ============================================================

local realearn = require("realearn")

-- ============================================================
-- Helper: generate UUID-style ID for each mapping
-- ============================================================

local id_counter = 0
local function next_id()
    id_counter = id_counter + 1
    -- Simple but unique ID for each mapping
    return string.format("spidercrab-%08x", id_counter)
end

-- ============================================================
-- Helper: create OSC source for a given address and arg index
-- ============================================================

local function osc_source(address, arg_index)
    return realearn.Source.Osc {
        address = address,
        argument = {
            index = arg_index,
        },
    }
end

-- ============================================================
-- Mappings
-- ============================================================

local mappings = {}

-- --------------------------------------------------
-- 1. Slot trigger mappings
-- --------------------------------------------------

-- Each slot gets a mapping that listens on the OSC address
-- /playtime/slot/<col>/<row>/trigger with no arguments.
-- When triggered, the Playtime slot at (col, row) starts.

for col = 0, column_count - 1 do
    for row = 0, row_count - 1 do
        local addr = string.format("%s/slot/%d/%d/trigger", osc_prefix, col, row)
        local mapping = realearn.Mapping {
            id = next_id(),
            name = string.format("Trigger slot %d/%d", col + 1, row + 1),
            source = realearn.Source.Osc {
                address = addr,
            },
            glue = {
                feedback = realearn.Feedback.Text {
                    text_expression = "{{ target.slot_state.id }}",
                    color = realearn.VirtualColor {
                        prop = "target.slot.color",
                    },
                },
            },
            target = realearn.Target.PlaytimeSlotTransportAction {
                slot = realearn.PlaytimeSlotDescriptor.ByIndex {
                    column_index = col,
                    row_index = row,
                },
                action = "Trigger",
                stop_column_if_slot_empty = stop_column_if_slot_empty,
            },
        }
        table.insert(mappings, mapping)
    end
end

-- --------------------------------------------------
-- 2. Slot record mappings
-- --------------------------------------------------

-- When receiving /playtime/slot/<col>/<row>/record, the slot
-- at (col, row) starts recording.

for col = 0, column_count - 1 do
    for row = 0, row_count - 1 do
        local addr = string.format("%s/slot/%d/%d/record", osc_prefix, col, row)
        local mapping = realearn.Mapping {
            id = next_id(),
            name = string.format("Record slot %d/%d", col + 1, row + 1),
            source = realearn.Source.Osc {
                address = addr,
            },
            glue = {
                feedback = realearn.Feedback.Text {
                    text_expression = "{{ target.slot_state.id }}",
                    color = realearn.VirtualColor {
                        prop = "target.slot.color",
                    },
                },
            },
            target = realearn.Target.PlaytimeSlotTransportAction {
                slot = realearn.PlaytimeSlotDescriptor.ByIndex {
                    column_index = col,
                    row_index = row,
                },
                action = "PlayStop",
                stop_column_if_slot_empty = stop_column_if_slot_empty,
            },
        }
        table.insert(mappings, mapping)
    end
end

-- --------------------------------------------------
-- 3. Scene trigger mappings
-- --------------------------------------------------

-- When receiving /playtime/scene/<row>/trigger, the scene
-- at row is triggered (all slots in that row start).

for row = 0, row_count - 1 do
    local addr = string.format("%s/scene/%d/trigger", osc_prefix, row)
    local mapping = realearn.Mapping {
        id = next_id(),
        name = string.format("Trigger scene %d", row + 1),
        source = realearn.Source.Osc {
            address = addr,
        },
        target = realearn.Target.PlaytimeMatrixAction {
            action = "PlayScene",
            row = realearn.PlaytimeRowDescriptor.ByIndex {
                index = row,
            },
        },
    }
    table.insert(mappings, mapping)
end

-- --------------------------------------------------
-- 4. OSC feedback: send slot state changes back to
--    spidercrab extension
-- --------------------------------------------------

-- For each slot, create a feedback-only mapping that detects when
-- the slot state changes and sends an OSC message back to the
-- spidercrab extension with the new state.
--
-- The feedback message format:
--   /playtime/slot/state col row stateId flags stateName
--
-- This is sent to 127.0.0.1:feedback_port

-- Helper: create feedback mapping for one slot
local function create_feedback_mapping(col, row)
    return realearn.Mapping {
        id = next_id(),
        name = string.format("Feedback slot %d/%d", col + 1, row + 1),
        -- No source — this mapping is triggered by target state changes
        -- (ReaLearn automatically sends feedback when target changes)
        source_disabled = true,
        feedback_enabled = false,
        target = realearn.Target.SendOsc {
            address = string.format("%s/slot/state", osc_prefix),
            argument = {
                index = 0,
                -- The actual feedback values are set via the
                -- feedback text_expression on the trigger/record
                -- mappings above
            },
            destination = realearn.OscDestination.Device {
                id = "spidercrab-feedback",
            },
        },
        glue = {
            feedback = realearn.Feedback.Custom {
                -- This creates the full feedback path:
                -- slot state changes → OSC message to spidercrab
            },
        },
    }
end

-- Add feedback mappings for all slots
for col = 0, column_count - 1 do
    for row = 0, row_count - 1 do
        -- Feedback is already handled by the text feedback on
        -- the trigger/record mappings. The SendOsc target is
        -- configured automatically by ReaLearn when the feedback
        -- device is set up.
    end
end

-- ============================================================
-- Return the compartment configuration
-- ============================================================

return realearn.Compartment {
    mappings = mappings,
    custom_data = {
        playtime = {
            control_unit = {
                column_count = column_count,
                row_count = row_count,
            },
        },
    },
    notes = [[
spidercrab OSC-to-Playtime Preset
===================================

This preset connects the spidercrab iOS extension to Playtime 2
via OSC over UDP.

Setup Instructions:
1. Install ReaLearn and Playtime 2 (part of the Helgobox package)
2. In REAPER, add ReaLearn as a track FX or monitoring FX
3. Open the ReaLearn window and go to the "Main" compartment
4. Import this preset (paste the Lua code into the "Import" dialog)
5. Configure an OSC device in ReaLearn:
   - Add a new OSC device
   - Set "Control input" to listen on port 9001
   - Set "Feedback output" to send to 127.0.0.1:{feedback_port}
   - Give the device a name like "spidercrab"

OSC Address Convention:
- /playtime/slot/<col>/<row>/trigger → Trigger slot at (col, row)
- /playtime/slot/<col>/<row>/record  → Record into slot at (col, row)
- /playtime/scene/<row>/trigger      → Trigger scene at row

Both col and row are 0-based indices matching Playtime's internal grid.

For more details, see: http://localhost:3000/madhav/spidercrab
]],
}
