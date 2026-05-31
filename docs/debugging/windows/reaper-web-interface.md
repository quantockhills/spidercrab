# REAPER Web Interface Protocol (Built-in HTTP Server)

**Source:** https://github.com/ReaTeam/Doc/blob/master/web_interface_modding.md
**Access date:** 2026-05-31

## What This Is

REAPER's built-in "Web Browser Interface" (Preferences -> Control/OSC/Web -> Add -> Web Browser Interface) implements an HTTP server that serves a JavaScript control surface. This is *separate* from our spidercrab extension — it's REAPER's own web server.

## Protocol Summary

The web interface uses HTTP requests to `/_/command` endpoint:

```javascript
wwr_req("command;command;command")
wwr_req_recur("command;command", interval)
```

Responses are tab-separated lines returned via `wwr_onreply(results)`.

## Relevance to spidercrab

### 1. REAPER's HTTP server works on Windows
This proves that serving web content from REAPER on Windows is possible. The issue in our code is specifically in how we use WDL's `WebServerBaseClass`, not a fundamental limitation.

### 2. REAPER uses its own HTTP server, NOT WDL's WebServerBaseClass
REAPER's built-in web server is implemented in REAPER's own C++ code, not in the WDL/jnetlib library. This means REAPER doesn't use `WebServerBaseClass` internally — it has its own HTTP implementation.

### 3. Alternative: Use REAPER's built-in server instead of our own
Instead of serving the frontend through our own HTTP server, we could potentially use REAPER's built-in web interface infrastructure. Our extension could register API endpoints with REAPER's existing HTTP server rather than running our own.

But the simpler insight: if REAPER can serve web content on Windows, the problem is WDL's `WebServerBaseClass`, not the platform.

**Source 2 (homemusicmaker.com):** Basic user guide, not technically relevant.
