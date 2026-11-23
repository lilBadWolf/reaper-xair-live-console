-- Live Console: REAPER-side helper for the Live Console web controller.
--
--  * Publishes every track's FX + current preset (and preset list) to ExtState "LiveConsole/STATE"
--    (read by the web app through REAPER's web API: GET/EXTSTATE/LiveConsole/STATE)
--  * Executes commands the web app writes to "LiveConsole/CMD"
--    (preset prev/next/select, FX bypass)
--  * Launches the mixer bridge (Node.js) if it isn't already running
--
-- `npm run setup` adds this to Scripts/__startup.lua so it runs whenever REAPER starts.
-- Running it again (e.g. from the Action list) replaces the running copy.

local SECTION       = "LiveConsole"
local PUBLISH_SECS  = 0.15   -- how often to rescan FX/presets
local LAUNCH_BRIDGE = true
local NODE_PATH     = nil    -- set to a full path to force a specific node binary

local r = reaper
local IS_WIN = r.GetOS():match("Win") ~= nil
local SEP = IS_WIN and "\\" or "/"
local script_dir = debug.getinfo(1, "S").source:match("^@(.*[/\\])") or ""
local bridge_js  = script_dir .. ".." .. SEP .. "bridge" .. SEP .. "xr18-bridge.mjs"
local data_dir   = r.GetResourcePath() .. SEP .. "LiveConsole"   -- songs, settings, log (survive updates)

---------------------------------------------------------------------------
-- tiny JSON writer; strings are percent-encoded so the payload never
-- contains backslashes/tabs/newlines that REAPER's web API would escape.
---------------------------------------------------------------------------
local function penc(s)
  return (tostring(s):gsub("[^%w%-%._~ ]", function(c) return string.format("%%%02X", c:byte()) end))
end
local function jstr(s) return '"' .. penc(s) .. '"' end

local function file_exists(p) local f = io.open(p, "r"); if f then f:close() return true end end

---------------------------------------------------------------------------
-- state publishing
---------------------------------------------------------------------------
local function track_at(idx) -- web API numbering: 0 = master, 1.. = tracks
  if idx == 0 then return r.GetMasterTrack(0) end
  return r.GetTrack(0, idx - 1)
end

---------------------------------------------------------------------------
-- preset names, read from REAPER's user preset file for each FX
-- (e.g. presets/vst3-ToneLib-GFX.ini: [Preset0] Name=Killswitch ...).
-- Cached per file; re-read when the preset count changes (preset saved/deleted).
---------------------------------------------------------------------------
local preset_cache = {} -- filename -> { count = n, json = '["a","b"]' }

local function read_preset_names(fn)
  local f = io.open(fn, "r")
  if not f then return nil end
  local names, cur = {}, nil
  for line in f:lines() do
    local c = line:byte(1)
    if c == 91 then -- '['
      cur = tonumber(line:match("^%[Preset(%d+)%]"))
    elseif c == 78 and cur then -- 'N'
      local nm = line:match("^Name=(.*)$")
      if nm then names[cur + 1] = nm:gsub("\r$", ""); cur = nil end
    end
  end
  f:close()
  local out = {}
  for i = 1, #names do out[i] = jstr(names[i] or "") end
  return { count = #names, json = "[" .. table.concat(out, ",") .. "]" }
end

local function preset_list_json(tr, f, pcount)
  local fn = r.TrackFX_GetUserPresetFilename(tr, f, "")
  if type(fn) ~= "string" then _, fn = r.TrackFX_GetUserPresetFilename(tr, f, "") end -- API returns (fn) or (ok, fn) by version
  if not fn or fn == "" then return "[]" end
  local c = preset_cache[fn]
  if not c or c.count ~= pcount then
    c = read_preset_names(fn) or { count = -1, json = "[]" }
    if c.count ~= pcount then c.json = "[]" end -- factory presets mixed in: indexes wouldn't line up
    c.count = pcount
    preset_cache[fn] = c
  end
  return c.json
end

local function describe_track(tr, idx)
  local n = r.TrackFX_GetCount(tr)
  if n == 0 then return nil end
  local fx = {}
  for f = 0, n - 1 do
    local _, name   = r.TrackFX_GetFXName(tr, f, "")
    local _, preset = r.TrackFX_GetPreset(tr, f, "")
    local pidx, pcount = r.TrackFX_GetPresetIndex(tr, f)
    fx[#fx + 1] = string.format(
      '{"i":%d,"name":%s,"preset":%s,"pi":%d,"pc":%d,"on":%s,"off":%s,"list":%s}',
      f, jstr(name), jstr(preset or ""), pidx or -1, pcount or 0,
      tostring(r.TrackFX_GetEnabled(tr, f)), tostring(r.TrackFX_GetOffline(tr, f)),
      (pcount or 0) > 0 and preset_list_json(tr, f, pcount) or "[]")
  end
  local _, tname = r.GetTrackName(tr)
  return string.format('{"idx":%d,"name":%s,"fx":[%s]}', idx, jstr(tname), table.concat(fx, ","))
end

local last_json = ""
local function publish()
  local tracks = {}
  local m = describe_track(r.GetMasterTrack(0), 0)
  if m then tracks[#tracks + 1] = m end
  for i = 0, r.CountTracks(0) - 1 do
    local t = describe_track(r.GetTrack(0, i), i + 1)
    if t then tracks[#tracks + 1] = t end
  end
  local json = '{"tracks":[' .. table.concat(tracks, ",") .. ']}'
  if json ~= last_json or r.GetExtState(SECTION, "STATE") ~= json then
    last_json = json
    r.SetExtState(SECTION, "STATE", json, false)
  end
end

---------------------------------------------------------------------------
-- commands: "seq|track|fx|op|arg"   op = next | prev | set | bypass
---------------------------------------------------------------------------
local last_seq = nil
local function handle_commands()
  local raw = r.GetExtState(SECTION, "CMD")
  if raw == "" then return end
  r.DeleteExtState(SECTION, "CMD", false)
  for line in raw:gmatch("[^\n]+") do
    local seq, ti, fi, op, arg = line:match("^([^|]*)|(%-?%d+)|(%d+)|(%a+)|?(.*)$")
    if seq and seq ~= last_seq then
      last_seq = seq
      local tr = track_at(tonumber(ti))
      local f = tonumber(fi)
      if tr and f < r.TrackFX_GetCount(tr) then
        if op == "next" then r.TrackFX_NavigatePresets(tr, f, 1)
        elseif op == "prev" then r.TrackFX_NavigatePresets(tr, f, -1)
        elseif op == "set" and tonumber(arg) then r.TrackFX_SetPresetByIndex(tr, f, tonumber(arg))
        elseif op == "bypass" then r.TrackFX_SetEnabled(tr, f, not r.TrackFX_GetEnabled(tr, f))
        end
        last_json = "" -- force immediate republish
        publish()
      end
    end
  end
end

---------------------------------------------------------------------------
-- bridge launcher (macOS / Linux / Windows)
---------------------------------------------------------------------------
local function first_line(cmd)
  local p = io.popen(cmd)
  if not p then return nil end
  local out = p:read("*l")
  p:close()
  if out and out ~= "" then return out end
end

-- REAPER doesn't inherit your shell's PATH, so look in the usual install places.
local function find_node()
  if NODE_PATH and file_exists(NODE_PATH) then return NODE_PATH end
  if IS_WIN then
    for _, p in ipairs({
      (os.getenv("ProgramFiles") or "C:\\Program Files") .. "\\nodejs\\node.exe",
      (os.getenv("LOCALAPPDATA") or "") .. "\\Programs\\nodejs\\node.exe",
      (os.getenv("APPDATA") or "") .. "\\nvm\\nodejs\\node.exe",
    }) do if file_exists(p) then return p end end
    return first_line('where node 2>nul')
  end
  local home = os.getenv("HOME") or ""
  for _, p in ipairs({
    "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node",
    home .. "/.volta/bin/node", home .. "/.local/bin/node",
  }) do if file_exists(p) then return p end end
  -- version managers: newest installed version
  return first_line('ls -1d "$HOME"/.nvm/versions/node/v*/bin/node "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node "$HOME"/.asdf/installs/nodejs/*/bin/node 2>/dev/null | sort -V | tail -n 1')
    or first_line("/bin/sh -lc 'command -v node' 2>/dev/null")
end

local function launch_bridge()
  if not LAUNCH_BRIDGE or not file_exists(bridge_js) then return end
  local node = find_node()
  if not node then
    r.ShowConsoleMsg("Live Console: Node.js not found, so the mixer bridge can't start.\n" ..
      "Install Node 18+ (nodejs.org) or set NODE_PATH at the top of live_console.lua.\n")
    return
  end
  r.RecursiveCreateDirectory(data_dir, 0)
  local log = data_dir .. SEP .. "bridge.log"
  -- The bridge exits by itself if its port is already taken, so launching again is harmless.
  if IS_WIN then
    r.ExecProcess(string.format('cmd.exe /C start "" /B "%s" "%s" --data "%s" --log "%s"', node, bridge_js, data_dir, log), -2)
  else
    r.ExecProcess(string.format("/bin/sh -c 'nohup \"%s\" \"%s\" --data \"%s\" --log \"%s\" >/dev/null 2>&1 &'", node, bridge_js, data_dir, log), -1)
  end
end

---------------------------------------------------------------------------
local GEN = string.format("%.0f-%d", r.time_precise() * 1000, math.random(1, 1e6))
local next_publish, next_hb = 0, 0
local function loop()
  if r.GetExtState(SECTION, "GEN") ~= GEN then return end -- superseded by a newer copy
  local now = r.time_precise()
  handle_commands()
  if now >= next_publish then publish(); next_publish = now + PUBLISH_SECS end
  if now >= next_hb then r.SetExtState(SECTION, "HB", string.format("%.0f", os.time()), false); next_hb = now + 1 end
  r.defer(loop)
end

r.SetExtState(SECTION, "GEN", GEN, false)
r.DeleteExtState(SECTION, "CMD", false)
launch_bridge()
loop()
r.atexit(function() r.DeleteExtState(SECTION, "HB", false) end)
