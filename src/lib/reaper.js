// Client for REAPER's built-in web API (/_/CMD;CMD;...), polled for fader/mute state,
// plus the LiveConsole Lua script's FX/preset state published via ExtState.
import { reactive } from 'vue';
import { settings } from './settings.js';

export const reaper = reactive({
  connected: false,
  scriptAlive: false,
  playState: 0,          // 0 stop, 1 play, 2 pause, 5 rec, 6 rec-pause
  tracks: [],            // index 0 = master
  fx: {},                // trackIdx -> [{i,name,preset,pi,pc,on,off}]
  recInputs: {},         // trackIdx -> I_RECINPUT
});

const unescape = (v) => String(v).replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
const pdec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// While the user holds a fader, ignore the polled value for that track.
const touching = new Map(); // idx -> expires timestamp

function parseTrack(tok) {
  const idx = +tok[1];
  const flags = +tok[3];
  const raw = +tok[13] || 0;
  return {
    idx,
    name: idx === 0 ? 'MASTER' : unescape(tok[2]),
    flags,
    folder: !!(flags & 1),
    selected: !!(flags & 2),
    hasFx: !!(flags & 4),
    muted: !!(flags & 8),
    soloed: !!(flags & 48),
    armed: !!(flags & 64),
    vol: +tok[4],
    pan: +tok[5],
    color: raw ? `#${(raw & 0xffffff).toString(16).padStart(6, '0')}` : null,
  };
}

let hbLast = null;
let trackSig = '';
let hbSeenAt = 0;
let tick = 0;

function applyResponse(text) {
  const tracks = [];
  for (const line of text.split('\n')) {
    const tok = line.split('\t');
    switch (tok[0]) {
      case 'TRANSPORT':
        reaper.playState = +tok[1];
        break;
      case 'TRACK':
        if (tok.length > 6) tracks.push(parseTrack(tok));
        break;
      default: {
        const m = /^GET\/TRACK\/(\d+)\/I_RECINPUT$/.exec(tok[0]);
        if (m) reaper.recInputs[+m[1]] = +tok[1];
        break;
      }
      case 'EXTSTATE':
        if (tok[1] !== 'LiveConsole') break;
        if (tok[2] === 'STATE' && tok[3]) {
          try {
            const data = JSON.parse(unescape(tok.slice(3).join('\t')));
            const fx = {};
            for (const t of data.tracks) {
              fx[t.idx] = t.fx.map((f) => ({ ...f, name: pdec(f.name), preset: pdec(f.preset), list: (f.list || []).map(pdec) }));
            }
            reaper.fx = fx;
          } catch (e) { console.warn('bad STATE', e); }
        } else if (tok[2] === 'HB') {
          if (tok[3] && tok[3] !== hbLast) { hbLast = tok[3]; hbSeenAt = Date.now(); }
        }
        break;
    }
  }
  if (!tracks.length) return;
  const now = Date.now();
  // keep fader values the user is currently dragging
  for (const t of tracks) {
    const exp = touching.get(t.idx);
    if (exp && exp > now) {
      const old = reaper.tracks.find((o) => o.idx === t.idx);
      if (old) t.vol = old.vol;
    }
  }
  // Same tracks as before: patch only changed fields, so strips re-render only when
  // something visible changes (not on every poll).
  const sig = tracks.map((t) => `${t.idx}:${t.name}`).join('|');
  if (sig === trackSig) {
    tracks.forEach((t, i) => {
      const o = reaper.tracks[i];
      for (const k in t) if (o[k] !== t[k]) o[k] = t[k];
    });
  } else {
    reaper.tracks = tracks;
    // Track list changed (added/removed/renamed): refresh record inputs.
    trackSig = sig;
    api(tracks.filter((t) => t.idx > 0).map((t) => `GET/TRACK/${t.idx}/I_RECINPUT`).join(';')).then(applyResponse).catch(() => {});
  }
  reaper.scriptAlive = now - hbSeenAt < 3500;
}

async function api(cmds) {
  const res = await fetch(`/_/${cmds}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  return res.text();
}

// Polls on a fixed clock with up to 2 requests in flight, so network round-trip
// time doesn't stretch the interval. Late (out-of-order) replies are dropped.
let sent = 0, applied = 0, inFlight = 0, failing = false;
function pollOnce() {
  if (inFlight >= 2 || (failing && inFlight)) return;
  const n = ++sent;
  let cmd = 'TRACK';
  if (tick % 2 === 0) cmd += ';TRANSPORT';
  if (tick++ % 3 === 0 || fxDirtyUntil > Date.now()) cmd += ';GET/EXTSTATE/LiveConsole/STATE;GET/EXTSTATE/LiveConsole/HB';
  inFlight++;
  api(cmd).then((text) => {
    if (n < applied) return;
    applied = n;
    applyResponse(text);
    reaper.connected = true;
    failing = false;
  }).catch(() => {
    reaper.connected = false;
    reaper.scriptAlive = false;
    failing = true;
  }).finally(() => { inFlight--; });
}
let started = false;
export function startReaper() {
  if (started) return;
  started = true;
  const loop = () => { pollOnce(); setTimeout(loop, failing ? 1000 : Math.max(30, settings.pollMs)); };
  loop();
}

// ---- track controls ----
const volTimers = new Map();
export function setVolume(idx, lin) {
  const t = reaper.tracks.find((o) => o.idx === idx);
  if (t) t.vol = lin;
  touching.set(idx, Date.now() + 400);
  // throttle: at most one request per 40ms per track, always sending the last value
  if (volTimers.has(idx)) { volTimers.get(idx).v = lin; return; }
  const entry = { v: lin };
  volTimers.set(idx, entry);
  api(`SET/TRACK/${idx}/VOL/${lin.toFixed(6)}`).catch(() => {});
  setTimeout(() => {
    volTimers.delete(idx);
    if (entry.v !== lin) setVolume(idx, entry.v);
  }, 40);
}
export function endVolumeTouch(idx) {
  touching.set(idx, Date.now() + 250);
}

function toggle(idx, what, key) {
  const t = reaper.tracks.find((o) => o.idx === idx);
  if (t) t[key] = !t[key];
  return api(`SET/TRACK/${idx}/${what}/-1`).catch(() => {});
}
export const toggleMute = (idx) => toggle(idx, 'MUTE', 'muted');
export const toggleSolo = (idx) => toggle(idx, 'SOLO', 'soloed');
export const toggleArm = (idx) => toggle(idx, 'RECARM', 'armed');

// ---- FX commands (executed by live_console.lua) ----
let seq = Date.now() % 100000;
let fxChain = Promise.resolve();
let fxDirtyUntil = 0;
export function fxCommand(trackIdx, fxIdx, op, arg = '') {
  // optimistic update for direct preset selection
  if (op === 'set') {
    const f = reaper.fx[trackIdx]?.find((x) => x.i === fxIdx);
    if (f && f.list[arg] !== undefined) { f.pi = +arg; f.preset = f.list[arg]; }
  }
  const line = `${++seq}|${trackIdx}|${fxIdx}|${op}|${arg}`;
  fxDirtyUntil = Date.now() + 1200; // poll STATE every tick for a moment
  // The script reads one command per defer cycle; space them out a little.
  fxChain = fxChain
    .then(() => api(`SET/EXTSTATE/LiveConsole/CMD/${encodeURIComponent(line)}`))
    .catch(() => {})
    .then(() => new Promise((r) => setTimeout(r, 70)));
  return fxChain;
}

// Several FX commands in ONE request (the script runs them all in the same cycle).
// lines: [{ trackIdx, fxIdx, op, arg }]. Keep batches small: REAPER cuts URLs at ~1 KB.
export function fxBatch(lines) {
  if (!lines.length) return Promise.resolve();
  for (const l of lines) { // optimistic, so a quick second tap doesn't toggle twice
    const f = reaper.fx[l.trackIdx]?.find((x) => x.i === l.fxIdx);
    if (!f) continue;
    if (l.op === 'set' && f.list[l.arg] !== undefined) { f.pi = +l.arg; f.preset = f.list[l.arg]; }
    if (l.op === 'bypass') f.on = !f.on;
  }
  fxDirtyUntil = Date.now() + 1500;
  const chunks = [];
  for (let i = 0; i < lines.length; i += 20) chunks.push(lines.slice(i, i + 20));
  for (const c of chunks) {
    const text = c.map((l) => `${++seq}|${l.trackIdx}|${l.fxIdx}|${l.op}|${l.arg ?? ''}`).join('\n');
    fxChain = fxChain
      .then(() => api(`SET/EXTSTATE/LiveConsole/CMD/${encodeURIComponent(text)}`))
      .catch(() => {})
      .then(() => new Promise((r) => setTimeout(r, 70)));
  }
  return fxChain;
}

// "VST3: ToneLib-GFX (ToneLib)" -> "ToneLib-GFX"
export function cleanFxName(name) {
  return String(name)
    .replace(/^(VST3?i?|AUi?|JS|CLAPi?|LV2i?|DX):\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
}
