#include "command_handler.h"
#include "command_handler_helpers.h"

// Settings command handlers — reserved for future settings-related WS commands.
//
// Currently, configuration is handled via direct method calls:
//   - CommandHandler::SetConfigDir() — called from main.cpp
//
// Future settings commands (e.g., config/get, config/set) will be added here.
