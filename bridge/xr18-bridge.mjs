#!/usr/bin/env node
// Live Console bridge: browsers can't speak UDP/OSC, so this small server (no dependencies
// except alphaTab, only for reading Guitar Pro files) relays between the web app (HTTP + Server-Sent Events) and a Behringer
// X Air mixer (XR18 / X18 / XR16 / XR12 / MR18; OSC over UDP port 10024).
// It also stores the LIVE tab's songs and setlists so every device shares them,
// and follows YARG (current song, lyrics, song position; see yarg.mjs).
//
//   node xr18-bridge.mjs [--host <mixer ip>] [--port 8899] [--data <dir>] [--log <file>]
//
//   --host  mixer IP (default: auto-discover on the LAN, remembered in the data dir)
//   --port  HTTP port for the web app (default 8899)
//   --data  where settings + songs are kept (default: env LIVE_CONSOLE_DATA, else ../data)
//   --log   append log output to this file (the REAPER script passes <data>/bridge.log)
//
// Endpoints (CORS open, LAN use):
//   GET  /events          SSE stream: {type:'snapshot'|'delta'|'status'|'learn'|'yarg'|'yargClock'|'yargBeat', ...}
//   GET  /status          JSON status
//   POST /send            {a:'/lr/mix/on', t:'i', v:0}  or an array of those
//   POST /query           {a:['/ch/01/mix/on', ...]}   ask the mixer for values
//   POST /config          {host:'192.168.1.50'}         ('' = auto-discover)
//                         {yargDir:'/path/to/YARG data'} ('' = auto: YARG's standard data folder)
//                         {yargAuto:true}              load the Live song matching what YARG plays (shared setting)
//   POST /yarg/claim      {key:'<play>:<what>'}         first device to ask gets "ok" (do it once per play), others "taken"
//   POST /yarg/menusync   {on:true}                     the menu song started from the top: follow it (approximate)
//   GET  /yarg/tab/track?id=pro-guitar|gp0…              tablature for one track of the current song (times in song seconds)
//   POST /yarg/tab/upload?name=file.gp5  (raw bytes)     attach a Guitar Pro file to the current YARG song
//   POST /yarg/tab/offset {offset:n|null}               which chart bar the tab starts on (null = automatic)
//   POST /yarg/tab/remove                               detach (delete) the current song's Guitar Pro file
//   POST /yarg/tab/tuning {track, tuning:[midi…]|null}  set a track's tuning for this song (null = as the chart/file says)
//   POST /live/doc        {songs, setlists, currentSetlistId}   LIVE tab song library + setlists (live-songs.json)
//   POST /live/active     {songId, sectionId}           what's loaded now (shown on every device)

import dgram from 'node:dgram';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createYarg } from './yarg.mjs';
import { createTabs } from './tabs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const XR_PORT = 10024;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);

// User data lives outside the code (so updates/git never touch it).
const DATA_DIR = path.resolve(args.data || process.env.LIVE_CONSOLE_DATA || path.join(HERE, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const CONFIG_FILE = path.join(DATA_DIR, 'bridge-config.json');
// One-time: older versions kept data next to this script. Copy it over (originals are left alone).
for (const f of ['bridge-config.json', 'live-songs.json']) {
  const legacy = path.join(HERE, f), dest = path.join(DATA_DIR, f);
  try { if (!fs.existsSync(dest) && fs.existsSync(legacy)) fs.copyFileSync(legacy, dest); } catch {}
}
if (args.log) {
  const out = fs.createWriteStream(path.resolve(args.log), { flags: 'a' });
  const write = out.write.bind(out);
  process.stdout.write = write;
  process.stderr.write = write;
}

let config = { host: '', httpPort: 8899, yargDir: '', yargAuto: false };
try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch {}
if (args.host !== undefined) config.host = args.host;
if (args.port) config.httpPort = Number(args.port);
const saveConfig = () => fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), () => {});

// ---------- LIVE songs (shared by every device) ----------
// { doc: { songs: [...] }, active: { songId, sectionId } } in live-songs.json, written atomically with a .bak.
const LIVE_FILE = path.join(DATA_DIR, 'live-songs.json');
let live = { doc: { songs: [] }, active: { songId: null, sectionId: null } };
try { live = { ...live, ...JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8')) }; } catch {}
function saveLive() {
  const tmp = `${LIVE_FILE}.tmp`;
  try { if (fs.existsSync(LIVE_FILE)) fs.copyFileSync(LIVE_FILE, `${LIVE_FILE}.bak`); } catch {}
  fs.writeFile(tmp, JSON.stringify(live, null, 2), (e) => { if (!e) fs.rename(tmp, LIVE_FILE, () => {}); });
}

// This computer's LAN IPv4 addresses (for QR codes that phones can open).
const lanIps = () => Object.entries(os.networkInterfaces())
  .flatMap(([name, list]) => (list || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, ip: a.address })))
  .sort((a, b) => (a.name.startsWith('en') ? 0 : 1) - (b.name.startsWith('en') ? 0 : 1));

const log = (...m) => console.log(new Date().toISOString(), ...m);

// ---------- OSC encode/decode ----------
const pad4 = (n) => (n + 3) & ~3;
function oscString(s) {
  const b = Buffer.from(s, 'utf8');
  const out = Buffer.alloc(pad4(b.length + 1));
  b.copy(out);
  return out;
}
function encode(address, list = []) {
  let tags = ',';
  const parts = [];
  for (const { t, v } of list) {
    tags += t;
    if (t === 'i') { const b = Buffer.alloc(4); b.writeInt32BE(v | 0); parts.push(b); }
    else if (t === 'f') { const b = Buffer.alloc(4); b.writeFloatBE(Number(v)); parts.push(b); }
    else if (t === 's') parts.push(oscString(String(v)));
    else throw new Error(`unsupported OSC type ${t}`);
  }
  return Buffer.concat([oscString(address), oscString(tags), ...parts]);
}
function readString(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  return [buf.toString('utf8', off, end), pad4(end + 1)];
}
function decode(buf) {
  let [address, off] = readString(buf, 0);
  if (off >= buf.length) return { address, args: [] };
  let tags; [tags, off] = readString(buf, off);
  const out = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { out.push({ t, v: buf.readInt32BE(off) }); off += 4; }
    else if (t === 'f') { out.push({ t, v: buf.readFloatBE(off) }); off += 4; }
    else if (t === 's') { let s; [s, off] = readString(buf, off); out.push({ t, v: s }); }
    else if (t === 'b') { const n = buf.readInt32BE(off); out.push({ t, v: buf.subarray(off + 4, off + 4 + n) }); off += pad4(4 + n); }
    else break;
  }
  return { address, args: out };
}

// ---------- mixer state ----------
const state = {};          // address -> {t, v}
let mixer = { connected: false, host: config.host, name: '', model: '', firmware: '' };
let lastReply = 0;
// The mixer socket is reopened while the mixer doesn't answer (see the heartbeat): a long-lived UDP socket can
// stay stuck after a network change (Wi-Fi reconnect, a VPN coming up) even though a new one works fine.
let sock = null, lastOpen = 0, reopenLogged = false;
function openSocket() {
  try { sock?.close(); } catch {}
  const s = dgram.createSocket('udp4');
  s.on('message', onMessage);
  s.on('error', (e) => log('mixer socket:', e.message)); // e.g. network down; the heartbeat reopens it
  s.bind(() => { try { s.setBroadcast(true); } catch {} });
  sock = s;
  lastOpen = Date.now();
}

function send(address, list = [], host = config.host) {
  if (!host || !sock) return;
  try { sock.send(encode(address, list), XR_PORT, host, () => {}); } catch {} // errors: see 'error' above
}

// Addresses we keep in sync. The web app may ask for more via /query.
const WATCH = ['/lr/mix/on', '/lr/mix/fader'];
const SENDS = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0')); // 01-06 aux, 07-10 fx
const strip = (p) => [
  `${p}/config/name`, `${p}/mix/on`, `${p}/mix/fader`, `${p}/mix/pan`, `${p}/preamp/rtnsw`,
  ...SENDS.map((s) => `${p}/mix/${s}/level`),
];
for (let c = 1; c <= 16; c++) WATCH.push(...strip(`/ch/${String(c).padStart(2, '0')}`));
WATCH.push(...strip('/rtn/aux'));
for (let b = 1; b <= 6; b++) WATCH.push(`/bus/${b}/config/name`, `/bus/${b}/mix/fader`, `/bus/${b}/mix/on`);
for (let f = 1; f <= 4; f++) WATCH.push(`/fxsend/${f}/config/name`);
for (let c = 1; c <= 15; c += 2) WATCH.push(`/config/chlink/${c}-${c + 1}`);
// FX returns 1-4 (name, mute, level, sends to the 6 buses) and bus stereo links
for (let r = 1; r <= 4; r++) WATCH.push(`/rtn/${r}/config/name`, `/rtn/${r}/mix/on`, `/rtn/${r}/mix/fader`, ...SENDS.slice(0, 6).map((s) => `/rtn/${r}/mix/${s}/level`));
for (let b = 1; b <= 5; b += 2) WATCH.push(`/config/buslink/${b}-${b + 1}`);
const extraWatch = new Set();
// Paced so a burst of ~250 queries doesn't overrun the mixer's UDP buffer.
function queryAll() {
  const list = [...WATCH, ...extraWatch];
  let i = 0;
  const step = () => {
    for (const end = i + 25; i < end && i < list.length; i++) send(list[i]);
    if (i < list.length) setTimeout(step, 15);
  };
  step();
}

function onMessage(buf, rinfo) {
  let msg;
  try { msg = decode(buf); } catch { return; }
  if (msg.address === '/xinfo') {
    // args: ip, name, model, firmware
    const [ip, name, model, fw] = msg.args.map((a) => a.v);
    if (!config.host) { config.host = rinfo.address; saveConfig(); log('discovered', name, model, 'at', rinfo.address); }
    if (rinfo.address !== config.host) return;
    lastReply = Date.now();
    const was = mixer.connected;
    mixer = { connected: true, host: config.host, name, model, firmware: fw, ip };
    if (!was) { log('connected to', name, model, config.host); reopenLogged = false; queryAll(); broadcast({ type: 'status', mixer }); }
    return;
  }
  if (rinfo.address !== config.host) return;
  lastReply = Date.now();
  if (msg.address === '/meters/1' && msg.args[0]?.t === 'b') return onMeters(msg.args[0].v);
  if (!msg.args.length || msg.args[0].t === 'b') return; // other blobs not handled
  const val = { t: msg.args[0].t, v: msg.args[0].v };
  const prev = state[msg.address];
  const known = WATCH.includes(msg.address) || extraWatch.has(msg.address);
  state[msg.address] = val;
  queueDelta(msg.address, val);
  if ((prev && prev.v !== val.v) || (!prev && !known)) learn(msg.address, val);
}
openSocket();

// Heartbeat + /xremote keeps the mixer pushing changes made elsewhere (X-Air Edit, app).
setInterval(() => {
  // no answer for 10 s: start over with a fresh socket (every 10 s until the mixer answers)
  if (!mixer.connected && Date.now() - lastReply > 10000 && Date.now() - lastOpen > 10000) {
    if (!reopenLogged) { log('no answer from the mixer: reopening the connection (repeats every 10 s until it answers)'); reopenLogged = true; }
    openSocket();
  }
  if (!config.host) { send('/xinfo', [], '255.255.255.255'); return; }
  send('/xinfo');
  send('/xremote');
  if (clients.size) send('/meters', [{ t: 's', v: '/meters/1' }]); // subscription lasts ~10s; renew while anyone listens
  if (mixer.connected && Date.now() - lastReply > 6000) {
    mixer.connected = false;
    log('lost contact with mixer');
    broadcast({ type: 'status', mixer });
  }
}, 2000);
send('/xinfo', [], config.host || '255.255.255.255');

// ---------- meters ----------
// /meters/1 = 40 levels (int16 LE, 1/256 dB), ~every 100 ms (the XR18's fixed rate):
// ch 1-16, aux L/R, fx1-4 return L/R, bus 1-6, fx send 1-4, main L/R, monitor L/R
function onMeters(blob) {
  if (!clients.size || blob.length < 4) return;
  const n = Math.min(blob.readInt32LE(0), (blob.length - 4) >> 1);
  const m = new Array(n);
  for (let i = 0; i < n; i++) m[i] = Math.round(blob.readInt16LE(4 + i * 2) / 25.6) / 10; // 0.1 dB
  broadcast({ type: 'meters', m });
}

// ---------- SSE ----------
const clients = new Set();
function broadcast(obj) {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) res.write(line);
}
let pending = {};
let pendingTimer = null;
function queueDelta(a, val) {
  pending[a] = val;
  pendingTimer ??= setTimeout(() => {
    broadcast({ type: 'delta', values: pending });
    pending = {};
    pendingTimer = null;
  }, 25);
}
// "Learn" ring buffer: addresses changed from other clients, so you can
// discover the right OSC path by flipping a control in X-Air Edit.
const learned = [];
function learn(a, val) {
  if (learned[0]?.a === a) learned.shift(); // collapse fader drags into one row
  learned.unshift({ a, ...val, at: Date.now() });
  learned.length = Math.min(learned.length, 40);
  broadcast({ type: 'learn', entry: learned[0] });
}

function readRaw(req, limit = 16 << 20) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (d) => { n += d.length; if (n > limit) { reject(new Error('file too large')); req.destroy(); } else parts.push(d); });
    req.on('end', () => resolve(Buffer.concat(parts)));
  });
}
function readBody(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (d) => (s += d));
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'snapshot', mixer, values: state, learned, live, lan: lanIps(), yarg: { ...yarg.snapshot(), auto: config.yargAuto } })}\n\n`);
    clients.add(res);
    if (clients.size === 1) send('/meters', [{ t: 's', v: '/meters/1' }]);
    const ka = setInterval(() => res.write(': ka\n\n'), 15000);
    req.on('close', () => { clients.delete(res); clearInterval(ka); });
    return;
  }
  if (url.pathname === '/status') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ mixer, config, clients: clients.size, lan: lanIps() }));
  }
  if (req.method === 'POST' && url.pathname === '/send') {
    const body = await readBody(req);
    const msgs = Array.isArray(body) ? body : [body];
    const changed = {};
    for (const m of msgs) {
      if (typeof m.a !== 'string' || !m.a.startsWith('/')) continue;
      if (m.t === undefined) { send(m.a); continue; }
      send(m.a, [{ t: m.t, v: m.v }]);
      state[m.a] = changed[m.a] = { t: m.t, v: m.v };
    }
    // The mixer doesn't echo to the sender, so tell every browser ourselves.
    if (Object.keys(changed).length) broadcast({ type: 'delta', values: changed });
    return res.end('ok');
  }
  if (req.method === 'POST' && url.pathname === '/query') {
    const body = await readBody(req);
    for (const a of body.a || []) { if (typeof a === 'string') { extraWatch.add(a); send(a); } }
    return res.end('ok');
  }
  if (req.method === 'POST' && url.pathname === '/live/doc') {
    const body = await readBody(req);
    if (!Array.isArray(body.songs)) { res.statusCode = 400; return res.end('songs[] required'); }
    live.doc = {
      songs: body.songs,
      setlists: Array.isArray(body.setlists) ? body.setlists : live.doc.setlists,
      currentSetlistId: body.currentSetlistId ?? live.doc.currentSetlistId ?? null,
    };
    saveLive();
    broadcast({ type: 'live', doc: live.doc });
    return res.end('ok');
  }
  if (req.method === 'POST' && url.pathname === '/live/active') {
    const body = await readBody(req);
    live.active = { songId: body.songId ?? null, sectionId: body.sectionId ?? null };
    saveLive();
    broadcast({ type: 'liveActive', active: live.active });
    return res.end('ok');
  }
  if (req.method === 'POST' && url.pathname === '/yarg/claim') {
    const body = await readBody(req);
    return res.end(yarg.claim(body.key) ? 'ok' : 'taken');
  }
  if (url.pathname.startsWith('/yarg/tab/')) {
    const json = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    try {
      if (url.pathname === '/yarg/tab/track') { const t = tabs.track(url.searchParams.get('id')); return t ? json(200, t) : json(404, { error: 'no such track' }); }
      if (req.method !== 'POST') return json(405, { error: 'POST' });
      if (url.pathname === '/yarg/tab/upload') return json(200, { file: await tabs.upload(url.searchParams.get('name') || '', await readRaw(req)) });
      if (url.pathname === '/yarg/tab/offset') { const b = await readBody(req); return json(200, { ok: tabs.setOffset(typeof b.offset === 'number' ? b.offset : null) }); }
      if (url.pathname === '/yarg/tab/remove') return json(200, { ok: tabs.remove() });
      if (url.pathname === '/yarg/tab/tuning') { const b = await readBody(req); return json(200, { ok: tabs.setTuning(b.track, b.tuning ?? null) }); }
    } catch (e) { return json(400, { error: e.message }); }
    return json(404, { error: 'not found' });
  }
  if (req.method === 'POST' && url.pathname === '/yarg/menusync') {
    const body = await readBody(req);
    return res.end(yarg.confirmMenu(body.on !== false) ? 'ok' : 'no');
  }
  if (req.method === 'POST' && url.pathname === '/config') {
    const body = await readBody(req);
    if (typeof body.host === 'string') {
      config.host = body.host.trim();
      saveConfig();
      mixer = { connected: false, host: config.host, name: '', model: '', firmware: '' };
      broadcast({ type: 'status', mixer });
      send('/xinfo', [], config.host || '255.255.255.255');
    }
    if (typeof body.yargDir === 'string') {
      config.yargDir = body.yargDir.trim();
      saveConfig();
      yarg.setDir();
    }
    if (typeof body.yargAuto === 'boolean') {
      config.yargAuto = body.yargAuto;
      saveConfig();
      broadcast({ type: 'yargAuto', on: config.yargAuto });
    }
    return res.end('ok');
  }
  res.statusCode = 404;
  res.end('not found');
});

// ---------- YARG ----------
const tabs = createTabs({ dataDir: DATA_DIR, log, broadcast });
const yarg = createYarg({ log, broadcast, getDir: () => config.yargDir, tabs });

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { log(`port ${config.httpPort} in use — bridge already running?`); process.exit(0); }
  throw e;
});
server.listen(config.httpPort, () => log(`Live Console bridge on :${config.httpPort}, mixer ${config.host || '(auto-discover)'}, data ${DATA_DIR}`));
